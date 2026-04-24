// NighthawkNews Support — script.js
//
// Static frontend for GitHub Pages backed by Firebase Firestore + Firebase Auth.
//
// SETUP
// -----
// 1. Create a Firebase project at https://console.firebase.google.com
// 2. Enable Cloud Firestore (in production mode) and Email/Password Authentication.
// 3. Paste your web app config into the `firebaseConfig` object below.
// 4. Configure Firestore security rules — see README.md.
//
// IMPORTANT: Do NOT hardcode admin passwords here. Admin accounts are created
// in the Firebase Authentication console (Users tab → Add user). The frontend
// only signs them in via Firebase Auth.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------------------------------------------------------------------------
// Firebase configuration — REPLACE THIS BLOCK with your project's web config.
// You can find it in Firebase Console → Project settings → Your apps → SDK setup.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const CONFIG_PLACEHOLDER = firebaseConfig.apiKey === "YOUR_API_KEY";

let app, auth, db;
if (!CONFIG_PLACEHOLDER) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const supportForm = $("support-form");
const supportStatus = $("support-status");
const supportSubmit = $("support-submit");

const loginForm = $("login-form");
const loginStatus = $("login-status");
const adminLogin = $("admin-login");
const adminDashboard = $("admin-dashboard");
const adminEmail = $("admin-email");
const adminStatus = $("admin-status");
const requestsList = $("requests-list");
const requestsEmpty = $("requests-empty");
const refreshBtn = $("refresh-btn");
const logoutBtn = $("logout-btn");

$("year").textContent = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setStatus(el, message, kind = "info") {
  if (!el) return;
  el.textContent = message;
  el.classList.remove("success", "error", "info");
  el.classList.add(kind);
}

function clearStatus(el) {
  if (!el) return;
  el.textContent = "";
  el.classList.remove("success", "error", "info");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(ts) {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const CATEGORY_LABELS = {
  login: "Login",
  feed: "Feed not loading",
  article: "Article issue",
  bias: "Bias score issue",
  account: "Account issue",
  other: "Other",
};

const STATUS_LABELS = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

function requireConfig(targetStatusEl) {
  if (CONFIG_PLACEHOLDER) {
    setStatus(
      targetStatusEl,
      "Firebase isn't configured yet. Paste your config into script.js to enable this feature.",
      "error"
    );
    return false;
  }
  return true;
}

function friendlyAuthError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "That email address looks invalid.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a minute.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// Support request submission
// ---------------------------------------------------------------------------
supportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus(supportStatus);

  if (!supportForm.checkValidity()) {
    supportForm.reportValidity();
    setStatus(supportStatus, "Please fill in the required fields.", "error");
    return;
  }

  if (!requireConfig(supportStatus)) return;

  const data = new FormData(supportForm);
  const payload = {
    name: String(data.get("name") || "").trim(),
    email: String(data.get("email") || "").trim(),
    category: String(data.get("category") || ""),
    message: String(data.get("message") || "").trim(),
    appVersion: String(data.get("appVersion") || "").trim(),
    deviceModel: String(data.get("deviceModel") || "").trim(),
    status: "open",
    createdAt: serverTimestamp(),
  };

  if (!payload.name || !payload.email || !payload.category || !payload.message) {
    setStatus(supportStatus, "Please fill in all required fields.", "error");
    return;
  }

  supportSubmit.disabled = true;
  setStatus(supportStatus, "Sending…", "info");

  try {
    await addDoc(collection(db, "supportRequests"), payload);
    supportForm.reset();
    setStatus(
      supportStatus,
      "Thanks! Your request has been received. We'll be in touch by email.",
      "success"
    );
  } catch (err) {
    console.error("Support submission failed", err);
    setStatus(
      supportStatus,
      "Sorry — we couldn't send your request. Please try again, or email us directly.",
      "error"
    );
  } finally {
    supportSubmit.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Admin login
// ---------------------------------------------------------------------------
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus(loginStatus);

  if (!loginForm.checkValidity()) {
    loginForm.reportValidity();
    return;
  }

  if (!requireConfig(loginStatus)) return;

  const data = new FormData(loginForm);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");

  setStatus(loginStatus, "Signing in…", "info");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will swap UI.
  } catch (err) {
    console.error("Login failed", err);
    setStatus(loginStatus, friendlyAuthError(err.code), "error");
  }
});

logoutBtn?.addEventListener("click", async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Logout failed", err);
    setStatus(adminStatus, "Couldn't sign out. Try again.", "error");
  }
});

refreshBtn?.addEventListener("click", () => loadRequests());

// ---------------------------------------------------------------------------
// Auth state — toggle login vs dashboard
// ---------------------------------------------------------------------------
if (!CONFIG_PLACEHOLDER) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      adminLogin.classList.add("hidden");
      adminDashboard.classList.remove("hidden");
      adminEmail.textContent = user.email || "(signed in)";
      clearStatus(loginStatus);
      loginForm.reset();
      loadRequests();
    } else {
      adminDashboard.classList.add("hidden");
      adminLogin.classList.remove("hidden");
      adminEmail.textContent = "—";
      requestsList.innerHTML = "";
      requestsEmpty.classList.add("hidden");
      clearStatus(adminStatus);
    }
  });
} else {
  setStatus(
    loginStatus,
    "Firebase isn't configured. Paste your config into script.js to enable admin sign-in.",
    "info"
  );
}

// ---------------------------------------------------------------------------
// Load and render support requests
// ---------------------------------------------------------------------------
async function loadRequests() {
  if (!requireConfig(adminStatus)) return;
  if (!auth.currentUser) return;

  setStatus(adminStatus, "Loading requests…", "info");
  requestsList.innerHTML = "";
  requestsEmpty.classList.add("hidden");

  try {
    const q = query(collection(db, "supportRequests"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      requestsEmpty.classList.remove("hidden");
      clearStatus(adminStatus);
      return;
    }

    snap.forEach((docSnap) => {
      requestsList.appendChild(renderRequest(docSnap.id, docSnap.data()));
    });
    setStatus(adminStatus, `Loaded ${snap.size} request${snap.size === 1 ? "" : "s"}.`, "info");
  } catch (err) {
    console.error("Failed to load requests", err);
    setStatus(
      adminStatus,
      "Couldn't load requests. Check your Firestore rules and that you're signed in as an admin.",
      "error"
    );
  }
}

function renderRequest(id, r) {
  const status = r.status || "open";
  const card = document.createElement("article");
  card.className = "request";
  card.dataset.id = id;

  const categoryLabel = CATEGORY_LABELS[r.category] || r.category || "—";

  card.innerHTML = `
    <div class="request-head">
      <div>
        <span class="request-name">${escapeHtml(r.name || "(no name)")}</span>
        <span class="request-email">&lt;${escapeHtml(r.email || "")}&gt;</span>
      </div>
      <span class="request-date">${escapeHtml(formatDate(r.createdAt))}</span>
    </div>

    <div class="request-tags">
      <span class="tag">${escapeHtml(categoryLabel)}</span>
      <span class="tag status-${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
      ${r.appVersion ? `<span class="tag">v${escapeHtml(r.appVersion)}</span>` : ""}
      ${r.deviceModel ? `<span class="tag">${escapeHtml(r.deviceModel)}</span>` : ""}
    </div>

    <p class="request-message">${escapeHtml(r.message || "")}</p>

    <div class="request-actions">
      <label class="muted small" for="status-${id}">Status</label>
      <select id="status-${id}" data-action="status">
        <option value="open" ${status === "open" ? "selected" : ""}>Open</option>
        <option value="in_progress" ${status === "in_progress" ? "selected" : ""}>In progress</option>
        <option value="resolved" ${status === "resolved" ? "selected" : ""}>Resolved</option>
      </select>
      <button class="btn btn-danger" data-action="delete" type="button">Delete</button>
    </div>
  `;

  card
    .querySelector('[data-action="status"]')
    .addEventListener("change", (e) => updateStatus(id, e.target.value, card));
  card
    .querySelector('[data-action="delete"]')
    .addEventListener("click", () => deleteRequest(id, card));

  return card;
}

async function updateStatus(id, newStatus, cardEl) {
  if (!requireConfig(adminStatus)) return;
  try {
    await updateDoc(doc(db, "supportRequests", id), { status: newStatus });
    const tag = cardEl.querySelector(".tag.status-open, .tag.status-in_progress, .tag.status-resolved");
    if (tag) {
      tag.className = `tag status-${newStatus}`;
      tag.textContent = STATUS_LABELS[newStatus] || newStatus;
    }
    setStatus(adminStatus, "Status updated.", "success");
  } catch (err) {
    console.error("Failed to update status", err);
    setStatus(adminStatus, "Couldn't update status. Check your permissions.", "error");
  }
}

async function deleteRequest(id, cardEl) {
  if (!requireConfig(adminStatus)) return;
  if (!confirm("Delete this support request? This cannot be undone.")) return;
  try {
    await deleteDoc(doc(db, "supportRequests", id));
    cardEl.remove();
    if (!requestsList.children.length) {
      requestsEmpty.classList.remove("hidden");
    }
    setStatus(adminStatus, "Request deleted.", "success");
  } catch (err) {
    console.error("Failed to delete request", err);
    setStatus(adminStatus, "Couldn't delete request. Check your permissions.", "error");
  }
}

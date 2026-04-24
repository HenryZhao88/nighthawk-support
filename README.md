# NewsHawk Support

A static support website for the NewsHawk iOS app, deployed via GitHub Pages and backed by Firebase (Firestore + Authentication).

Live URL (once enabled): <https://henryzhao88.github.io/newshawk-support>

The site contains:

- A hero + short app description
- An FAQ section
- A public support request form (writes to Firestore)
- An admin login (Firebase Email/Password Auth)
- An admin dashboard to view, update status, and delete support requests

The frontend is plain HTML/CSS/JS — no build step.

---

## 1. Enable GitHub Pages

1. Push this repository to GitHub. Make sure the repo is named `newshawk-support` (or update the live URL to match your repo).
2. In GitHub, open **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Pick the `main` branch and the `/ (root)` folder, then **Save**.
5. Wait ~1 minute. Your site will be available at `https://<your-username>.github.io/<repo-name>/`.

Any push to `main` redeploys automatically.

---

## 2. Create a Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Name it (e.g. `newshawk-support`). Google Analytics is optional.
3. Once the project is ready, go to **Project settings → General → Your apps**.
4. Click the **Web** icon (`</>`) to register a new web app. Skip Firebase Hosting.
5. Copy the resulting `firebaseConfig` object — you'll paste it into `script.js`.

---

## 3. Enable Cloud Firestore

1. In the Firebase Console, open **Build → Firestore Database**.
2. Click **Create database** and choose **Start in production mode**.
3. Pick a region close to your users (this can't be changed later).
4. After creation, open the **Rules** tab and paste the rules from [section 6](#6-firestore-security-rules) below. **This is required before you launch.**

The site writes documents into a collection called `supportRequests`.

---

## 4. Enable Email/Password Authentication

1. In the Firebase Console, open **Build → Authentication → Get started**.
2. Under the **Sign-in method** tab, enable **Email/Password**.
3. Switch to the **Users** tab and click **Add user** to create your admin account(s).
   - Use any email you control and a strong password.
   - **Do not commit admin passwords to source control.** This frontend never stores them.
4. Copy the **UID** of each admin user (you'll need it for the security rules).

---

## 5. Paste your Firebase config

Open [`script.js`](script.js) and replace the placeholder block near the top:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

The web `apiKey` is **not a secret** — it identifies your project to Firebase. Real security comes from your Firestore rules (next section), so configure those before going live.

While the placeholder values are in place, the form and admin login show a friendly "Firebase isn't configured yet" message rather than failing silently.

---

## 6. Firestore security rules

The rules below let anyone create a support request, but only signed-in admins can read, update, or delete them. Replace `ADMIN_UID_1` / `ADMIN_UID_2` with the UIDs you copied in step 4 (you can list one or many).

Paste this into **Firestore → Rules → Edit rules**, then **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null && request.auth.uid in [
        "ADMIN_UID_1",
        "ADMIN_UID_2"
      ];
    }

    match /supportRequests/{docId} {
      // Anyone (unauthenticated) can submit a support request,
      // but only with a sane shape and a server-side timestamp.
      allow create: if
        request.resource.data.keys().hasOnly([
          "name", "email", "category", "message",
          "appVersion", "deviceModel", "status", "createdAt"
        ])
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() < 200
        && request.resource.data.email is string
        && request.resource.data.email.matches(".+@.+\\..+")
        && request.resource.data.category in [
          "login", "feed", "article", "bias", "account", "other"
        ]
        && request.resource.data.message is string
        && request.resource.data.message.size() > 0
        && request.resource.data.message.size() < 5000
        && request.resource.data.appVersion is string
        && request.resource.data.appVersion.size() < 50
        && request.resource.data.deviceModel is string
        && request.resource.data.deviceModel.size() < 100
        && request.resource.data.status == "open"
        && request.resource.data.createdAt == request.time;

      // Only admins can list, view, update, or delete requests.
      allow read, update, delete: if isAdmin();
    }

    // Lock everything else down by default.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> ⚠️ **Don't skip this.** Without the rules, either nobody can submit requests (production mode) or your data is wide open (test mode). Configure rules before launch.

If you'd rather use a custom claim (e.g. `request.auth.token.admin == true`) than a UID list, set the claim with the [Firebase Admin SDK](https://firebase.google.com/docs/auth/admin/custom-claims) and update `isAdmin()` accordingly.

---

## 7. (Optional) Restrict your API key

In **Google Cloud Console → APIs & Services → Credentials**, edit your web API key and add an **HTTP referrer** restriction:

```
https://<your-username>.github.io/*
http://localhost:*
```

This prevents the key from being abused on other domains. Combined with strong Firestore rules, this gives you defense in depth.

---

## File layout

```
.
├── index.html    # Markup
├── styles.css    # Theme, glass cards, layout
├── script.js     # Firebase init, form handling, admin dashboard
└── README.md     # This file
```

## Local development

This is plain static HTML — open `index.html` directly, or run any static server:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

ES modules are imported from the Firebase CDN, so you need to serve over `http://` (not `file://`) for the admin dashboard to work.

---

## Security checklist before launch

- [ ] Firestore is in **production mode**, not test mode.
- [ ] The security rules from section 6 are published.
- [ ] At least one admin user exists in Firebase Authentication.
- [ ] The admin UID list in the rules matches reality.
- [ ] Your web API key is restricted to your GitHub Pages domain.
- [ ] No admin passwords or secrets are checked into the repo.

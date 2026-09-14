# Personal Project OS

A personal project management app for one person running many projects at
once — areas, projects, tasks, a scored "what should I work on?" view, a
month calendar, a filterable board, and a lightweight weekly review.

Data syncs across devices via Firebase (Google sign-in + Firestore). Each
person's data lives in their own private subtree, enforced by Firestore
security rules — see `firestore.rules`.

## 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   → **Add project** → give it a name → you can skip Google Analytics,
   it's not needed here.
2. Once created, click the **`</>`** (web) icon on the project overview page
   to register a web app. Give it a nickname, skip Firebase Hosting (you're
   deploying via Vercel/Netlify instead).
3. It'll show you a `firebaseConfig` object with six values
   (`apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`) — you'll need these in step 4.

## 2. Turn on Google sign-in

1. In the Firebase Console sidebar: **Build → Authentication → Get started**.
2. Under **Sign-in method**, click **Google** → toggle **Enable** → pick a
   support email → **Save**. That's it — no separate Google Cloud OAuth
   client to create by hand.

## 3. Create Firestore and set security rules

1. Sidebar: **Build → Firestore Database → Create database**. Choose a
   location close to you, start in **production mode**.
2. Go to the **Rules** tab → replace the contents with what's in
   `firestore.rules` in this repo → **Publish**.

## 4. Set environment variables

Vite only exposes variables prefixed with `VITE_` to the browser. Copy the
six values from step 1 into your deploy platform's environment variables:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

See `.env.example`. For local dev, copy it to `.env.local` and fill in your
values (these six are safe to expose in client code — that's normal for
Firebase's web config; the security rules from step 3 are what actually
protect the data, not secrecy of these values).

## 5. Authorize your deployed domain

Firebase Auth only allows sign-in popups from domains you've approved.
In **Authentication → Settings → Authorized domains**, add your Vercel
domain (e.g. `kerja-pintar.vercel.app`). `localhost` is included by default
for local dev.

## 6. Run it locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). You'll be asked
to sign in with Google before the app loads.

## 7. Build for production

```bash
npm run build
npm run preview   # sanity-check the production build locally
```

## 8. Push to GitHub / deploy

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Vercel and Netlify both auto-detect Vite (build command `npm run build`,
output directory `dist`) — make sure the six `VITE_FIREBASE_*` variables
from step 4 are set in the project's environment settings, then redeploy.

## If sign-in doesn't work

- **Google login completes but you're bounced right back to the sign-in
  screen, no error shown** — this is Vercel's default
  `Cross-Origin-Opener-Policy` header blocking the popup from reporting
  success back to the app. `vercel.json` in this repo sets the header
  Firebase needs (`same-origin-allow-popups`) — make sure it's deployed,
  then redeploy. (Deploying on Netlify instead? Add the same header via
  a `netlify.toml` `[[headers]]` block.)
- **"popup blocked" or nothing happens on click** — your browser blocked
  the sign-in popup. Allow popups for the site and try again (the app also
  auto-falls-back to a full-page redirect in this case).
- **"unauthorized domain" error** — the domain you're testing on isn't in
  Firebase's Authorized domains list (Authentication → Settings). Note
  Vercel preview URLs (`myapp-git-branch-name.vercel.app`) are *different*
  domains from your production one and need adding separately if you test
  on them.
- **Blank/loading forever** — check the browser console; it usually means
  one of the six env vars is missing or misspelled.

## Notes for future you

- `src/App.jsx` is the whole application UI (single file). It only ever
  talks to `window.storage` — it has no idea Firebase exists.
- `src/AuthGate.jsx` handles Google sign-in and wires `window.storage` to
  `src/lib/firestoreStorage.js` once someone's signed in, then renders `App`.
- `src/lib/firestoreStorage.js` implements the same four methods
  (`get`/`set`/`delete`/`list`) against Firestore — this is the only file
  that knows about Firebase's data shape.
- `src/lib/storage.js` is the old localStorage-only version, unused by
  default now but kept in case you ever want a no-login offline mode —
  point `main.jsx` at `App` directly instead of `AuthGate` to use it.
- Theme (light/dark) is a separate, unrelated `localStorage` key
  (`ppos-theme`) — that one stays local intentionally, since it's a device
  display preference, not app data.

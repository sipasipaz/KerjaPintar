# Personal Project OS

A personal project management app for one person running many projects at
once — areas, projects, tasks, a scored "what should I work on?" view, a
month calendar, a filterable board, and a lightweight weekly review.

Data syncs across devices via Supabase (Postgres + Auth), with Google as
the sign-in provider. Each person's data is private to their account,
enforced by row-level security in Postgres — see `supabase.sql`.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com) (or use the one
   already connected via the Vercel integration).
2. Go to **SQL Editor** → paste the contents of `supabase.sql` from this repo
   → Run. This creates the `kv_store` table and locks it down so a user can
   only ever read/write their own rows.
3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Turn on Google sign-in

1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   (or reuse) a project → **APIs & Services → Credentials → Create
   Credentials → OAuth client ID** → Application type: **Web application**.
2. In Supabase, go to **Authentication → Providers → Google** and copy the
   **Callback URL (for OAuth)** shown there.
3. Back in Google Cloud Console, paste that callback URL into **Authorized
   redirect URIs** on the OAuth client, then copy the generated **Client ID**
   and **Client Secret**.
4. Paste the Client ID and Client Secret into the Google provider settings
   in Supabase and save. Toggle the provider **on**.
5. In Supabase → **Authentication → URL Configuration**, set **Site URL** to
   your deployed URL (e.g. `https://kerja-pintar.vercel.app`) and add it
   under **Redirect URLs** too (plus `http://localhost:5173` for local dev).

## 3. Set environment variables

Vite only exposes variables prefixed with `VITE_` to the browser. If the
Vercel↔Supabase integration already added its own env vars, they likely
**don't** have this prefix and won't be visible to the app — add these two
explicitly in your deployment platform's project settings:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

See `.env.example`. For local dev, copy it to `.env.local` and fill in your
values.

## 4. Run it locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). You'll be asked
to sign in with Google before the app loads.

## 5. Build for production

```bash
npm run build
npm run preview   # sanity-check the production build locally
```

## 6. Push to GitHub / deploy

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Vercel and Netlify both auto-detect Vite (build command `npm run build`,
output directory `dist`) — just make sure the two `VITE_SUPABASE_*`
variables from step 3 are set in the project's environment settings, then
redeploy after adding them.

## Notes for future you

- `src/App.jsx` is the whole application UI (single file). It only ever
  talks to `window.storage` — it has no idea Supabase exists.
- `src/AuthGate.jsx` handles Google sign-in and wires `window.storage` to
  `src/lib/supabaseStorage.js` once someone's signed in, then renders `App`.
- `src/lib/supabaseStorage.js` implements the same four methods
  (`get`/`set`/`delete`/`list`) against the `kv_store` table — this is the
  only file that knows about Supabase's data shape.
- `src/lib/storage.js` is the old localStorage-only version, unused by
  default now but kept in case you ever want a no-login offline mode —
  point `main.jsx` at `App` directly instead of `AuthGate` to use it.
- Theme (light/dark) is a separate, unrelated `localStorage` key
  (`ppos-theme`) — that one stays local intentionally, since it's a device
  display preference, not app data.

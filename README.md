# Personal Project OS

A personal project management app for one person running many projects at
once — areas, projects, tasks, a scored "what should I work on?" view, and a
lightweight weekly review. See the in-app UI for the full feature set.

Data is stored in your browser's `localStorage` (see `src/lib/storage.js`).
That means it's private to your browser/device — clearing site data will
clear it, and it won't sync across devices unless you later swap in a real
backend behind the same four-method interface (`get`/`set`/`delete`/`list`).

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Build for production

```bash
npm run build
npm run preview   # sanity-check the production build locally
```

The build output goes to `dist/`.

## Push to GitHub

From inside this folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Create the empty repo on GitHub first (github.com → New repository — don't
initialize it with a README, so there's no merge conflict with this commit).

## Deploy

Both Vercel and Netlify auto-detect Vite projects — no config file needed.

**Vercel**
1. vercel.com → Add New → Project → import your GitHub repo.
2. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
3. Deploy.

**Netlify**
1. netlify.com → Add new site → Import an existing project → your GitHub repo.
2. Build command: `npm run build`. Publish directory: `dist`.
3. Deploy.

Every push to `main` will then auto-redeploy.

## Notes for future you

- `src/App.jsx` is the whole application (single file, matches the original
  spec's "execution over documentation" philosophy — see the file for the
  section-by-section feature notes).
- `src/lib/storage.js` is the only file that knows about persistence. If you
  add real accounts / multi-device sync later, that's the file to replace.

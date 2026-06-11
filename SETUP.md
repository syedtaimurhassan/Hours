# Hours — Setup Guide

A personal work-hours tracker PWA. One big button to start/end shifts,
pause/resume breaks, manual time editing with native pickers, and a dashboard
with day/week/month/custom filters. Works offline, syncs across devices, and
installs to the home screen on iOS and Android.

Two one-time setups are needed: **Firebase** (your database + login) and
**GitHub Pages** (hosting). Both are free.

---

## 1. Firebase setup (~5 minutes)

1. Go to <https://console.firebase.google.com> → **Add project**.
   Name it anything (e.g. `hours`). Google Analytics: **disable** (not needed).

2. **Enable login:** In the left menu → **Build → Authentication** →
   **Get started** → **Sign-in method** tab → **Email/Password** → Enable →
   Save.

3. **Create the database:** **Build → Firestore Database** → **Create
   database** → location: `europe-west3 (Frankfurt)` (closest to Denmark) →
   **Start in production mode** (IMPORTANT — never test mode) → Create.

4. **Paste the security rules:** In Firestore → **Rules** tab, replace
   everything with the contents of [`firestore.rules`](firestore.rules) in
   this repo → **Publish**. These rules make every user's data private to
   their own login.

5. **Register the web app:** Project overview (gear icon) → **Project
   settings** → **General** → under *Your apps* click the web icon `</>` →
   nickname `hours` → (do NOT tick Firebase Hosting) → Register app.
   You'll see a `firebaseConfig = { ... }` code block — **copy the values**.

6. **Local config:** copy [`.env.example`](.env.example) to `.env.local` and
   fill in the six `VITE_FIREBASE_*` values. `.env.local` is gitignored — the
   config is never committed to the repo.

7. **Authorize your domain:** Authentication → **Settings** →
   **Authorized domains** → **Add domain** → `<your-github-username>.github.io`.
   Without this, login works locally but fails in production with
   `auth/unauthorized-domain`.

8. **Restrict the API key (recommended):** the config is inlined into the
   client bundle (normal for Firebase web apps — it is *not* a secret), so lock
   it down: Google Cloud console → **APIs & Services → Credentials** → your
   browser key → **Application restrictions: HTTP referrers** → add
   `https://<your-github-username>.github.io/*`. Security ultimately rests on
   the Firestore rules (step 4) + authorized domains (step 7).

---

## 2. GitHub Pages setup (~3 minutes)

The repository **must be named `Hours`** (or update `REPO` in
[`vite.config.ts`](vite.config.ts) to match your repo name — it controls the
URL path).

```bash
# from this folder
gh repo create Hours --public --source=. --push
# or manually: create an empty public repo named "Hours" on github.com, then
git remote add origin https://github.com/<you>/Hours.git
git push -u origin main
```

Then on github.com → your repo → **Settings → Pages** → under *Build and
deployment* set **Source: GitHub Actions**.

**Add the Firebase config as Actions secrets** (required — the deployed build
reads these; without them the live app shows "App configuration error"):
repo → **Settings → Secrets and variables → Actions → New repository secret**,
and add all six with the same values as your `.env.local`:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Every push to `main` now runs tests, builds (injecting those secrets), and
deploys. Your app will be at:

```
https://<your-github-username>.github.io/Hours/
```

---

## 3. Install on your phone

- **iPhone:** open the URL in **Safari** → Share (□↑) → **Add to Home
  Screen**. (The app also shows these instructions the first time.) You'll
  sign in once more inside the installed app — that's normal (separate
  storage).
- **Android:** Chrome usually offers an install banner automatically; if not,
  the app's Settings screen shows an **Install app** row.

## Local development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (watch mode); npm test -- --run for one-shot
npm run build      # typecheck + production build
npm run icons      # regenerate PWA icons (already committed)
```

## Day-to-day use

- Tap **Start shift** → work → tap **End shift**. Closing the app changes
  nothing — the shift is stored in the cloud and the timer survives restarts,
  reboots, and switching devices.
- **Pause** during unpaid breaks; break time is deducted from "Worked".
- Forgot to end? After 12 h the app warns you and the End button opens a
  recovery flow where you pick the real end time.
- Tap any shift card to edit times/breaks or delete it. **＋** in History adds
  a forgotten shift.
- Only one shift can run at a time — enforced across all your devices.
- The ⏳ badge in the header means changes haven't reached the cloud yet
  (offline); they sync automatically when you're back online.

# Hours

A personal work‑hours tracker. Tap one big button to start a shift, tap again to
end it — even if the app was closed in between. Take breaks, fix times after the
fact, organise shifts by job, and see your totals. It installs to the home
screen on iOS and Android and works offline.

**Live app:** https://syedtaimurhassan.github.io/Hours/

---

## Purpose

Built for someone who works hourly and needs to log their own time reliably and
with zero friction. The whole app is one tap to start, one tap to stop — the
running shift lives in the cloud, so it survives closing the app, rebooting, or
switching phones, and only one shift can ever run at a time (enforced across all
your devices).

## Features

- **One‑button timer** — start/stop a shift; the live timer is computed from
  timestamps, so it's always correct even after the app was frozen for hours.
- **Breaks** — pause/resume during a shift; break time is deducted from "worked".
- **Manual editing** — tap any shift to correct its times with a native date
  picker and an Apple‑style time wheel; **swipe left to delete**.
- **Forgot to end?** — after a configurable threshold the app warns you and
  offers a recovery flow to set the real end time.
- **Multiple jobs** — colour‑coded workplaces, per‑job totals, pick one per shift.
- **Timesheet dashboard** — Day / Week / Month / Custom filters, a worked‑hours
  bar chart, and **CSV export** for payroll.
- **Offline‑first** — every action is queued locally and **uploads automatically
  the moment the network is back**.
- **Installable PWA** — add to home screen on iOS/Android; no app store.

## How it works

A fully static single‑page app (no server of its own) that talks **directly to
Firebase** from the browser:

- **Auth** — Firebase email/password; your data syncs across devices.
- **Data** — Cloud Firestore, one document per shift under `users/{uid}/shifts`.
  Offline persistence queues writes and syncs on reconnect. Security is enforced
  by [`firestore.rules`](firestore.rules) (each user can only read/write their
  own data) — the Firebase web config in the bundle is public by design.
- **PWA** — `vite-plugin-pwa` generates the manifest + service worker for
  installability and offline caching.
- **Time** — all instants are stored as epoch milliseconds; every duration is
  epoch subtraction (DST‑safe). Display and day‑grouping are pinned to
  `Europe/Copenhagen` (DD‑MM‑YYYY, 24‑hour).
- **Hosting** — built by GitHub Actions and served from GitHub Pages.

## Tech stack / dependencies

**Runtime**
- `react` / `react-dom` — UI
- `firebase` — Auth + Firestore (the only backend)
- `date-fns` + `@date-fns/tz` — DST‑safe date math pinned to a timezone

**Build / dev**
- `vite` + `@vitejs/plugin-react` — bundler
- `typescript` — types
- `tailwindcss` + `@tailwindcss/vite` — styling
- `vite-plugin-pwa` — manifest + service worker
- `vitest` — unit tests (time, durations, validation, reconciliation, etc.)

## Project structure

```
src/
  App.tsx            App shell: auth gate, header, banners, sheets
  firebase.ts        Firebase init (config from env vars)
  lib/               Pure logic + hooks (time, durations, shift ops,
                     reconciliation, validation, export, chart, auth, snapshots)
  screens/           Login · Main (Timer) · History (Timesheet) · Settings
  components/        BigButton, ShiftCard, TimeField (wheel), EditShiftSheet, …
tests/               Vitest suites for the pure logic
firestore.rules      Per‑user security rules
.github/workflows/   Build + deploy to GitHub Pages
```

## Run locally

```bash
npm install
cp .env.example .env.local      # then paste your Firebase web config
npm run dev                     # local dev server
npm test                        # unit tests (npm test -- --run for one shot)
npm run build                   # typecheck + production build
```

## Configure & deploy your own

1. **Firebase** — create a project, enable **Email/Password** auth, create a
   **Firestore** database (production mode), and publish the rules from
   [`firestore.rules`](firestore.rules). Add `<user>.github.io` to
   Authentication → authorized domains.
2. **Config** — copy `.env.example` to `.env.local` and fill in the six
   `VITE_FIREBASE_*` values (Firebase console → Project settings → your web app).
   For deploys, add the same six as **GitHub Actions repository secrets**.
3. **GitHub Pages** — set the repo name as `base` in
   [`vite.config.ts`](vite.config.ts), then repo → Settings → Pages →
   Source: **GitHub Actions**. Every push to `main` runs the tests, builds, and
   deploys.

> The Firebase web config is *not* secret — it ships in the client bundle of
> every Firebase web app. Security comes from the Firestore rules + authorized
> domains, so also restrict the API key to your Pages origin in Google Cloud.

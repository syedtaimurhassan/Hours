import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

/**
 * Firebase web config — sourced from Vite env vars, NOT hardcoded.
 * - Local dev/build: set them in `.env.local` (gitignored). See `.env.example`.
 * - GitHub Pages deploy: set them as repository secrets; the deploy workflow
 *   injects them at build time (see .github/workflows/deploy.yml).
 *
 * NOTE: these values are NOT secret — Vite inlines them into the client bundle,
 * so the deployed app exposes them to anyone (this is normal for all Firebase
 * web apps). Security comes from the Firestore rules (firestore.rules),
 * Authentication authorized-domains, and an API-key HTTP-referrer restriction —
 * never from hiding the config. Keeping them in env vars just keeps the source
 * repo clean and makes the project easy to swap or rotate.
 */
const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
}

/** False until every required env var is present (e.g. a clone with no .env). */
export const isConfigured = Object.values(firebaseConfig).every(
  (v) => v.length > 0,
)

// Initialize even when unconfigured so importing this module never throws;
// App.tsx renders <ConfigError/> before any Firebase call is made, and useAuth
// skips attaching a listener when !isConfigured.
const app = initializeApp(
  isConfigured
    ? firebaseConfig
    : { apiKey: 'unconfigured', projectId: 'unconfigured', appId: 'unconfigured' },
)

export const auth = getAuth(app)

/**
 * Multi-tab persistent cache: an Android Chrome tab and the installed WebAPK
 * share one origin cache — without the multi-tab manager the second context
 * fails persistence and silently loses offline support. Also covers two
 * desktop tabs. If IndexedDB is unavailable (private browsing), the SDK falls
 * back to memory cache; App shows the private-browsing banner.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
})

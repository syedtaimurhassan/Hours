import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

/**
 * Paste your Firebase web-app config here (Firebase console → Project
 * settings → General → Your apps → SDK setup and configuration → Config).
 * This object is public by design — security comes from the Firestore rules
 * (firestore.rules), not from hiding these values.
 */
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID',
}

/** False until the placeholder config above is replaced with real values. */
export const isConfigured = !Object.values(firebaseConfig).some((v) =>
  v.includes('PASTE_'),
)

const app = initializeApp(firebaseConfig)

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

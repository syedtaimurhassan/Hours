import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000

// Guards against registering the SW listeners more than once across the app's
// lifetime — usePWAUpdate is called from App(), which mounts exactly once, but
// belt-and-braces keeps the "registration happens once" invariant true even if
// the call site ever moves.
let listenersWired = false

/**
 * registerType 'prompt': an auto-reload could fire mid-edit or mid-recovery;
 * a tracker whose screen can sit open for 9 hours must never yank the page.
 * We check for updates on every return to the foreground and hourly — iOS
 * standalone PWAs can live for weeks without a navigation.
 *
 * MUST be mounted at App() (not the auth-gated Shell): the SW should register
 * on first visit so offline precaching and chunk-error recovery work before
 * login, and so listeners don't stack on every sign-in/out cycle.
 */
export function usePWAUpdate(): { updateReady: boolean; applyUpdate: () => void } {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration || listenersWired) return
      listenersWired = true
      const check = () => void registration.update().catch(() => {})
      setInterval(check, UPDATE_CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  useEffect(() => {
    // Last-ditch white-screen recovery for a stale HTML referencing vanished
    // hashed chunks. One-shot: if a reload already happened this session and
    // the error persists (e.g. partial cache eviction), don't loop forever.
    const onPreloadError = () => {
      try {
        if (sessionStorage.getItem('hours.preloadReloaded') === '1') return
        sessionStorage.setItem('hours.preloadReloaded', '1')
      } catch {
        /* private browsing — accept the small risk over an infinite loop */
      }
      location.reload()
    }
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => window.removeEventListener('vite:preloadError', onPreloadError)
  }, [])

  return {
    updateReady: needRefresh,
    applyUpdate: () => void updateServiceWorker(true),
  }
}

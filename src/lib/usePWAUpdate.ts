import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000

/**
 * registerType 'prompt': an auto-reload could fire mid-edit or mid-recovery;
 * a tracker whose screen can sit open for 9 hours must never yank the page.
 * We check for updates on every return to the foreground and hourly — iOS
 * standalone PWAs can live for weeks without a navigation.
 */
export function usePWAUpdate(): { updateReady: boolean; applyUpdate: () => void } {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update().catch(() => {})
      const interval = setInterval(check, UPDATE_CHECK_INTERVAL_MS)
      const onVisible = () => {
        if (document.visibilityState === 'visible') check()
      }
      document.addEventListener('visibilitychange', onVisible)
      // Listeners live for the app's lifetime — registration happens once.
      void interval
    },
  })

  useEffect(() => {
    // Last-ditch white-screen recovery: stale HTML referencing vanished
    // hashed chunks fires this Vite event.
    const onPreloadError = () => location.reload()
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => window.removeEventListener('vite:preloadError', onPreloadError)
  }, [])

  return {
    updateReady: needRefresh,
    applyUpdate: () => void updateServiceWorker(true),
  }
}

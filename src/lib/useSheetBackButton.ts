import { useEffect, useRef } from 'react'

// Module-level guard: when WE call history.back() in cleanup, the resulting
// popstate must not be interpreted as a user pressing Back (which would close a
// freshly re-mounted sheet — exactly the StrictMode double-invoke trap).
let suppressNextPop = false

/**
 * Opening any sheet pushes one history entry; popstate closes it — so Android
 * system back closes the Edit sheet (triggering its dirty guard) instead of
 * backgrounding the WebAPK or losing unsaved input. The app keeps exactly one
 * URL — no router.
 *
 * StrictMode-safe: cleanup pops only the entry this instance pushed, and flags
 * the self-triggered popstate so a re-mounted instance's listener ignores it.
 */
export function useSheetBackButton(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    let pushed = false
    if (!(history.state as { sheet?: boolean } | null)?.sheet) {
      history.pushState({ sheet: true }, '')
      pushed = true
    }
    const onPop = () => {
      if (suppressNextPop) {
        suppressNextPop = false
        return
      }
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Only consume the entry WE added, and tell the next popstate to ignore
      // the back() we're about to trigger.
      if (pushed && (history.state as { sheet?: boolean } | null)?.sheet) {
        suppressNextPop = true
        history.back()
      }
    }
  }, [open])
}

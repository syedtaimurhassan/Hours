import { useEffect, useRef } from 'react'

/**
 * Opening any sheet pushes one history entry; popstate closes it — so Android
 * system back closes the Edit sheet (triggering its dirty guard) instead of
 * backgrounding the WebAPK or losing unsaved input. Back on Track with
 * nothing open behaves normally. The app keeps exactly one URL — no router.
 */
export function useSheetBackButton(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    let poppedOrClosed = false
    history.pushState({ sheet: true }, '')
    const onPop = () => {
      poppedOrClosed = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Programmatic close (✕, Save): consume the entry we pushed.
      if (!poppedOrClosed) history.back()
    }
  }, [open])
}

import { useEffect, useRef } from 'react'

/**
 * Opening any sheet pushes one history entry; popstate closes it — so Android
 * system back closes the Edit sheet (triggering its dirty guard) instead of
 * backgrounding the WebAPK or losing unsaved input. Back on Track with
 * nothing open behaves normally. The app keeps exactly one URL — no router.
 *
 * StrictMode-safe: the dev double-mount would otherwise push → cleanup back()
 * → re-push → pop, self-closing the sheet on open. We only push if our entry
 * isn't already on the stack, and only pop in cleanup if this instance pushed.
 */
export function useSheetBackButton(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    let pushedByUs = false
    if (!(history.state as { sheet?: boolean } | null)?.sheet) {
      history.pushState({ sheet: true }, '')
      pushedByUs = true
    }
    let closed = false
    const onPop = () => {
      closed = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Programmatic close (✕, Save) consumes the entry we pushed; a popstate
      // close already consumed it. Never call back() for an entry we didn't add.
      if (pushedByUs && !closed && (history.state as { sheet?: boolean } | null)?.sheet) {
        history.back()
      }
    }
  }, [open])
}

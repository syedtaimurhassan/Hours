import { useEffect, useState } from 'react'

/**
 * 1-second cadence for live timers — the interval NEVER owns the value; every
 * consumer recomputes elapsed from persisted timestamps. visibilitychange /
 * focus / pageshow recompute immediately, so iOS freezing the standalone PWA
 * for hours costs nothing: the first frame after resume is already correct.
 */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const wake = () => setNow(Date.now())
    wake()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    window.addEventListener('pageshow', wake)
    const id = ticking ? setInterval(wake, 1000) : undefined
    return () => {
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
      window.removeEventListener('pageshow', wake)
      if (id !== undefined) clearInterval(id)
    }
  }, [ticking])

  return now
}

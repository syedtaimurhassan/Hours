import { workedMs } from '../lib/durations'
import { formatDuration, formatTimer } from '../lib/time'
import { useNow } from '../lib/useNow'
import type { Shift } from '../types'

/**
 * Leaf components that own the 1-second tick. Screens render these inside an
 * otherwise-static layout, so each second only the timer's text node updates —
 * the dashboard around it never re-renders. This is the modularization that
 * keeps the app feeling native instead of reloading wholesale.
 */

/** Big H:MM:SS net-worked timer for the active shift. */
export function LiveTimer({ shift }: { shift: Shift }) {
  const now = useNow(true)
  return (
    <span aria-live="off" className="tabular-digits">
      {formatTimer(workedMs(shift, now))}
    </span>
  )
}

/** "12 m" elapsed since a timestamp (e.g. current break). */
export function LiveElapsedSince({ since }: { since: number }) {
  const now = useNow(true)
  return <span className="tabular-digits">{formatDuration(now - since)}</span>
}

/** Net-worked duration of one shift; ticks only while it is running. */
export function LiveWorked({ shift, live }: { shift: Shift; live: boolean }) {
  const now = useNow(live)
  return <span className="tabular-digits">{formatDuration(workedMs(shift, now))}</span>
}

/** Summed worked total across shifts; ticks only when something is running. */
export function LiveTotal({
  shifts,
  live,
}: {
  shifts: Shift[]
  live: boolean
}) {
  const now = useNow(live)
  let total = 0
  for (const s of shifts) if (!s.deleted) total += workedMs(s, now)
  return <span className="tabular-digits">{formatDuration(total)}</span>
}

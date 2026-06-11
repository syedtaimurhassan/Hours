import { formatTimer } from '../lib/time'

/**
 * Pure derivation — the value is always now − timestamps, recomputed by
 * useNow's cadence. aria-live stays off (a per-second announcement is noise);
 * state changes update the parent's aria-label instead.
 */
export function ElapsedTimer({ ms }: { ms: number }) {
  return (
    <span aria-live="off" className="tabular-digits">
      {formatTimer(ms)}
    </span>
  )
}

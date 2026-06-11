/**
 * Measured server−client clock offset, persisted in localStorage and applied
 * to offline-path Stamps — so a 30-min-fast phone tapping in a basement
 * records a corrected time, not a 30-min-wrong one. Best-effort: a stale
 * offset is still strictly better than none.
 */
const KEY = 'hours.clockOffsetMs'

// Only trust a measurement if the write was acked within this window of the
// tap: both tapMs and now come from the same client clock, so this gates on
// real elapsed time regardless of how wrong that clock is. A prompt ack means
// srv − ms ≈ −clockError (+ commit delay ≤ the window).
const FRESH_ACK_MS = 15_000

// An offset beyond this is garbage (e.g. a device with a wildly future date);
// ignore rather than "correct" by a week.
const SANE_LIMIT_MS = 7 * 24 * 3_600_000

let cached: number | null = null
const listeners = new Set<() => void>()

/** Subscribe to clock-offset changes (so the "clock looks off" banner is
 * reactive — the offset is measured asynchronously from acked snapshots). */
export function subscribeClockOffset(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getClockOffsetMs(): number {
  if (cached !== null) return cached
  try {
    const raw = localStorage.getItem(KEY)
    const n = raw === null ? 0 : Number(raw)
    cached = Number.isFinite(n) && Math.abs(n) <= SANE_LIMIT_MS ? n : 0
  } catch {
    cached = 0 // private browsing — in-memory only
  }
  return cached
}

/**
 * Record offset from a server-acked stamp written by this device.
 * Call with the resolved server ms, the original tap ms, and the current time.
 */
export function maybeRecordClockOffset(
  srvMs: number,
  tapMs: number,
  nowMs: number,
): void {
  if (nowMs - tapMs > FRESH_ACK_MS) return // queue delay would contaminate
  const offset = srvMs - tapMs
  if (Math.abs(offset) > SANE_LIMIT_MS) return
  if (cached === offset) return
  cached = offset
  try {
    localStorage.setItem(KEY, String(offset))
  } catch {
    // private browsing — keep the in-memory value
  }
  listeners.forEach((fn) => fn())
}

/** Tap time corrected for known device-clock error (used on offline paths). */
export function correctedMs(tapMs: number): number {
  return tapMs + getClockOffsetMs()
}

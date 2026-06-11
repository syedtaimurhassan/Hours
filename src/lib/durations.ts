import type { Shift, Stamp } from '../types'
import { resolveMs } from './time'

/**
 * The effective end of a shift — used by ALL rendering and derivation.
 * - A manual end (`srv == null`) is authoritative by ordering: stopClaims are
 *   ignored entirely, so a claim that syncs in late can never silently shorten
 *   a deliberate correction (reconciliation deletes the moot claim later).
 * - Otherwise first-stop-wins: the minimum of the committed end and all claims.
 * - null = the shift is open.
 */
export function effectiveEndMs(shift: Shift): number | null {
  if (shift.end && shift.end.srv === null) return shift.end.ms
  const candidates: number[] = []
  if (shift.end) candidates.push(resolveMs(shift.end))
  for (const claim of Object.values(shift.stopClaims ?? {})) {
    candidates.push(resolveMs(claim))
  }
  return candidates.length ? Math.min(...candidates) : null
}

/** "Running" is derived data: open iff not deleted and no effective end. */
export function isOpen(shift: Shift): boolean {
  return !shift.deleted && effectiveEndMs(shift) === null
}

/** The open break's id, or null. Earliest-started wins if data has several. */
export function openBreakId(shift: Shift): string | null {
  let best: { id: string; ms: number } | null = null
  for (const [id, b] of Object.entries(shift.breaks ?? {})) {
    if (b.end === null) {
      const ms = resolveMs(b.start)
      if (!best || ms < best.ms) best = { id, ms }
    }
  }
  return best?.id ?? null
}

export type Interval = { start: number; end: number }

/**
 * Break intervals clamped to the shift window and UNIONED (never summed) —
 * even double-pause races or bad historical data yield correct net time.
 * Open breaks run to the shift end (or `nowMs` on an open shift).
 */
export function unionedBreakIntervals(shift: Shift, nowMs: number): Interval[] {
  const shiftStart = resolveMs(shift.start)
  const shiftEnd = effectiveEndMs(shift) ?? nowMs
  const raw: Interval[] = []
  for (const b of Object.values(shift.breaks ?? {})) {
    const start = Math.max(resolveMs(b.start), shiftStart)
    const end = Math.min(b.end ? resolveMs(b.end) : shiftEnd, shiftEnd)
    if (end > start) raw.push({ start, end })
  }
  raw.sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const iv of raw) {
    const last = out[out.length - 1]
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end)
    } else {
      out.push({ ...iv })
    }
  }
  return out
}

export function breakMs(shift: Shift, nowMs: number): number {
  return unionedBreakIntervals(shift, nowMs).reduce(
    (sum, iv) => sum + (iv.end - iv.start),
    0,
  )
}

/** Gross shift duration, clamped ≥ 0 (bad data must never deflate a sum). */
export function shiftMs(shift: Shift, nowMs: number): number {
  const end = effectiveEndMs(shift) ?? nowMs
  return Math.max(0, end - resolveMs(shift.start))
}

/** Net worked time = shift − unioned breaks, clamped ≥ 0. */
export function workedMs(shift: Shift, nowMs: number): number {
  return Math.max(0, shiftMs(shift, nowMs) - breakMs(shift, nowMs))
}

export type Totals = { shiftMs: number; breakMs: number; workedMs: number }

export function periodTotals(shifts: Shift[], nowMs: number): Totals {
  const totals: Totals = { shiftMs: 0, breakMs: 0, workedMs: 0 }
  for (const s of shifts) {
    if (s.deleted) continue
    totals.shiftMs += shiftMs(s, nowMs)
    totals.breakMs += breakMs(s, nowMs)
    totals.workedMs += workedMs(s, nowMs)
  }
  return totals
}

/** A shift whose data says end ≤ start needs the ⚠ Check times badge. */
export function hasBadTimes(shift: Shift): boolean {
  const end = effectiveEndMs(shift)
  return end !== null && end <= resolveMs(shift.start)
}

/** Test/build helper for fake server stamps. */
export function srvStamp(ms: number): Stamp['srv'] {
  return { toMillis: () => ms }
}

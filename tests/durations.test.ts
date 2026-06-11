import { describe, expect, it } from 'vitest'
import {
  breakMs,
  effectiveEndMs,
  hasBadTimes,
  isOpen,
  openBreakId,
  periodTotals,
  shiftMs,
  srvStamp,
  unionedBreakIntervals,
  workedMs,
} from '../src/lib/durations'
import { wallToEpoch } from '../src/lib/time'
import type { Shift, Stamp } from '../src/types'

const H = 3_600_000
const MIN = 60_000
const T0 = Date.UTC(2026, 5, 9, 7, 0) // 09:00 Copenhagen (CEST)

const live = (ms: number): Stamp => ({ ms, srv: srvStamp(ms) })
const manual = (ms: number): Stamp => ({ ms, srv: null })

function shift(partial: Partial<Shift>): Shift {
  return {
    id: 's1',
    start: live(T0),
    end: null,
    stopClaims: {},
    breaks: {},
    deleted: false,
    deletedAtMs: null,
    createdAt: srvStamp(T0),
    updatedAt: srvStamp(T0),
    updatedBy: 'devA',
    ...partial,
  }
}

describe('effectiveEndMs / isOpen', () => {
  it('open shift: no end, no claims', () => {
    const s = shift({})
    expect(effectiveEndMs(s)).toBeNull()
    expect(isOpen(s)).toBe(true)
  })

  it('committed end', () => {
    const s = shift({ end: live(T0 + 8 * H) })
    expect(effectiveEndMs(s)).toBe(T0 + 8 * H)
    expect(isOpen(s)).toBe(false)
  })

  it('stop claim alone ends the shift (offline end)', () => {
    const s = shift({ stopClaims: { devB: live(T0 + 6 * H) } })
    expect(effectiveEndMs(s)).toBe(T0 + 6 * H)
  })

  it('first stop wins: min of end and claims', () => {
    const s = shift({
      end: live(T0 + 8 * H),
      stopClaims: { devB: live(T0 + 6 * H), devC: live(T0 + 7 * H) },
    })
    expect(effectiveEndMs(s)).toBe(T0 + 6 * H)
  })

  it('MANUAL end ignores stopClaims entirely (manual wins by ordering)', () => {
    // phone offline-stops at 16:00 → laptop manually corrects end to 17:00 →
    // phone's queued claim merges back in last. The claim must be inert.
    const s = shift({
      end: manual(T0 + 8 * H), // manual 17:00
      stopClaims: { phone: live(T0 + 7 * H) }, // late claim 16:00
    })
    expect(effectiveEndMs(s)).toBe(T0 + 8 * H)
  })

  it('deleted shift is never open', () => {
    const s = shift({ deleted: true, deletedAtMs: T0 + H })
    expect(isOpen(s)).toBe(false)
  })
})

describe('break union and clamping', () => {
  it('basic worked = shift − breaks', () => {
    const s = shift({
      end: live(T0 + 8 * H),
      breaks: {
        b1: { start: live(T0 + 3 * H), end: live(T0 + 3 * H + 30 * MIN) },
      },
    })
    expect(shiftMs(s, T0 + 9 * H)).toBe(8 * H)
    expect(breakMs(s, T0 + 9 * H)).toBe(30 * MIN)
    expect(workedMs(s, T0 + 9 * H)).toBe(7 * H + 30 * MIN)
  })

  it('overlapping breaks are UNIONED, never summed', () => {
    const s = shift({
      end: live(T0 + 8 * H),
      breaks: {
        b1: { start: live(T0 + 2 * H), end: live(T0 + 3 * H) },
        b2: { start: live(T0 + 2 * H + 30 * MIN), end: live(T0 + 3 * H + 30 * MIN) },
      },
    })
    // union = [2h, 3.5h] = 1.5h, not 2h
    expect(breakMs(s, T0 + 9 * H)).toBe(90 * MIN)
    expect(unionedBreakIntervals(s, T0 + 9 * H)).toHaveLength(1)
  })

  it('break outside the shift window is clamped', () => {
    const s = shift({
      end: live(T0 + 8 * H),
      breaks: {
        b1: { start: live(T0 - H), end: live(T0 + H) }, // starts before shift
        b2: { start: live(T0 + 7 * H), end: live(T0 + 10 * H) }, // ends after
      },
    })
    expect(breakMs(s, T0 + 12 * H)).toBe(H + H)
  })

  it('open break on an ENDED shift clamps at the shift end', () => {
    const s = shift({
      end: live(T0 + 8 * H),
      breaks: { b1: { start: live(T0 + 7 * H), end: null } },
    })
    expect(breakMs(s, T0 + 20 * H)).toBe(H)
    expect(workedMs(s, T0 + 20 * H)).toBe(7 * H)
  })

  it('open break on an OPEN shift runs to now', () => {
    const s = shift({
      breaks: { b1: { start: live(T0 + 2 * H), end: null } },
    })
    const now = T0 + 2 * H + 20 * MIN
    expect(breakMs(s, now)).toBe(20 * MIN)
    expect(workedMs(s, now)).toBe(2 * H)
  })

  it('openBreakId returns the earliest open break', () => {
    const s = shift({
      breaks: {
        late: { start: live(T0 + 3 * H), end: null },
        early: { start: live(T0 + 2 * H), end: null },
        closed: { start: live(T0 + H), end: live(T0 + H + 10 * MIN) },
      },
    })
    expect(openBreakId(s)).toBe('early')
  })
})

describe('bad-data guards', () => {
  it('end ≤ start clamps duration to 0 and flags the shift', () => {
    const s = shift({ end: live(T0 - H) })
    expect(shiftMs(s, T0 + H)).toBe(0)
    expect(workedMs(s, T0 + H)).toBe(0)
    expect(hasBadTimes(s)).toBe(true)
  })

  it('a negative-duration record can never deflate period totals', () => {
    const bad = shift({ id: 'bad', end: live(T0 - 2 * H) })
    const good = shift({ id: 'good', end: live(T0 + 4 * H) })
    const totals = periodTotals([bad, good], T0 + 5 * H)
    expect(totals.workedMs).toBe(4 * H)
  })

  it('deleted shifts are excluded from totals', () => {
    const del = shift({ id: 'del', end: live(T0 + 4 * H), deleted: true, deletedAtMs: T0 })
    const good = shift({ id: 'good', end: live(T0 + 4 * H) })
    expect(periodTotals([del, good], T0 + 5 * H).workedMs).toBe(4 * H)
  })

  it('queued stopClaim arriving after a manual end stays inert in totals', () => {
    const s = shift({
      end: manual(T0 + 8 * H),
      stopClaims: { phone: live(T0 + 6 * H) },
    })
    expect(workedMs(s, T0 + 9 * H)).toBe(8 * H)
  })
})

describe('DST: durations are epoch subtraction, breaks included', () => {
  // Copenhagen spring-forward 2026-03-29 (01:00 CET → 03:00 CEST) and
  // fall-back 2026-10-25 (03:00 CEST → 02:00 CET). Wall-clock math would be
  // wrong by an hour; epoch math is exact.
  const sf = (hh: number, mm = 0) => wallToEpoch(2026, 3, 29, hh, mm)
  const fb = (hh: number, mm = 0) => wallToEpoch(2026, 10, 25, hh, mm)

  it('shift spanning spring-forward with a break across the jump', () => {
    // 23:00 prev-day → 04:00; the 00:00–04:00 wall window is only 3 real hours.
    const start = wallToEpoch(2026, 3, 28, 23, 0)
    const end = sf(4, 0)
    const s = shift({
      start: live(start),
      end: live(end),
      breaks: { b1: { start: live(sf(0, 30)), end: live(sf(3, 30)) } },
    })
    // 01:00→03:00 doesn't exist, so 00:30→03:30 wall is 2 real hours of break.
    expect(shiftMs(s, end + H)).toBe(4 * H) // 23:00→04:00 = 4 real hours
    expect(breakMs(s, end + H)).toBe(2 * H)
    expect(workedMs(s, end + H)).toBe(2 * H)
  })

  it('shift spanning fall-back with a break across the repeated hour', () => {
    // 01:30 CEST → 03:30 CET is 3 real hours (02:00–03:00 happens twice).
    const start = fb(1, 30)
    const end = fb(3, 30)
    const s = shift({
      start: live(start),
      end: live(end),
      breaks: { b1: { start: live(fb(1, 45)), end: live(fb(3, 15)) } },
    })
    expect(shiftMs(s, end + H)).toBe(3 * H)
    // 01:45→03:15 across the fall-back is 2.5 real hours.
    expect(breakMs(s, end + H)).toBe(2 * H + 30 * MIN)
    expect(workedMs(s, end + H)).toBe(30 * MIN)
  })
})

describe('period totals', () => {
  it('sums shift, break and worked across shifts', () => {
    const a = shift({
      id: 'a',
      end: live(T0 + 8 * H),
      breaks: { b1: { start: live(T0 + 3 * H), end: live(T0 + 4 * H) } },
    })
    const b = shift({
      id: 'b',
      start: live(T0 + 10 * H),
      end: live(T0 + 12 * H),
    })
    const totals = periodTotals([a, b], T0 + 13 * H)
    expect(totals.shiftMs).toBe(10 * H)
    expect(totals.breakMs).toBe(H)
    expect(totals.workedMs).toBe(9 * H)
  })
})

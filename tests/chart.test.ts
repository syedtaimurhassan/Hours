import { describe, expect, it } from 'vitest'
import { buildBuckets } from '../src/lib/chart'
import { srvStamp } from '../src/lib/durations'
import { dayRange, weekRange, wallToEpoch } from '../src/lib/time'
import type { Shift, Stamp } from '../src/types'

const H = 3_600_000
const live = (ms: number): Stamp => ({ ms, srv: srvStamp(ms) })

function shiftOn(y: number, m: number, d: number, hours: number, id: string): Shift {
  const start = wallToEpoch(y, m, d, 8, 0)
  return {
    id,
    start: live(start),
    end: live(start + hours * H),
    jobId: null,
    stopClaims: {},
    breaks: {},
    deleted: false,
    deletedAtMs: null,
    createdAt: srvStamp(start),
    updatedAt: srvStamp(start),
    updatedBy: 'd',
  }
}

describe('buildBuckets', () => {
  it('a week → 7 day buckets, worked attributed to the start day', () => {
    const anchor = wallToEpoch(2026, 6, 10, 12, 0) // Wed, ISO week 24 (Mon 8th)
    const { start, end } = weekRange(anchor)
    const shifts = [
      shiftOn(2026, 6, 8, 5, 'mon'), // Monday 5h
      shiftOn(2026, 6, 10, 8, 'wed'), // Wednesday 8h
    ]
    const buckets = buildBuckets(shifts, start, end, anchor)
    expect(buckets).toHaveLength(7)
    expect(buckets[0].workedMs).toBe(5 * H) // Mon
    expect(buckets[2].workedMs).toBe(8 * H) // Wed
    expect(buckets[1].workedMs).toBe(0) // Tue
    // Bars sum to the period total.
    const sum = buckets.reduce((a, b) => a + b.workedMs, 0)
    expect(sum).toBe(13 * H)
  })

  it('marks the current day bucket', () => {
    const anchor = wallToEpoch(2026, 6, 10, 12, 0)
    const { start, end } = weekRange(anchor)
    const buckets = buildBuckets([], start, end, anchor)
    expect(buckets.filter((b) => b.isCurrent)).toHaveLength(1)
    expect(buckets[2].isCurrent).toBe(true) // Wed
  })

  it('a single day → no buckets (chart hidden)', () => {
    const anchor = wallToEpoch(2026, 6, 10, 12, 0)
    const { start, end } = dayRange(anchor)
    expect(buildBuckets([], start, end, anchor)).toEqual([])
  })

  it('a long range buckets by ISO week', () => {
    const start = wallToEpoch(2026, 1, 1, 0, 0)
    const end = wallToEpoch(2026, 3, 1, 0, 0) // ~59 days
    const shifts = [shiftOn(2026, 1, 5, 4, 'a'), shiftOn(2026, 2, 10, 6, 'b')]
    const buckets = buildBuckets(shifts, start, end, end)
    expect(buckets.length).toBeLessThan(15) // weeks, not ~59 days
    expect(buckets.every((b) => b.label.startsWith('W'))).toBe(true)
    const sum = buckets.reduce((a, b) => a + b.workedMs, 0)
    expect(sum).toBe(10 * H)
  })
})

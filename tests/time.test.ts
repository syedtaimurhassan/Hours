import { describe, expect, it } from 'vitest'
import {
  SKEW_LIMIT_MS,
  customRange,
  dayKey,
  dayRange,
  formatDate,
  formatDateTime,
  formatDuration,
  formatTime,
  formatTimer,
  isoWeekNumber,
  monthRange,
  resolveMs,
  startOfDayTZ,
  toDateInputValue,
  toTimeInputValue,
  wallToEpoch,
  weekRange,
} from '../src/lib/time'
import { srvStamp } from '../src/lib/durations'

const H = 3_600_000
const MIN = 60_000

describe('DST-safe wall↔epoch (Europe/Copenhagen)', () => {
  it('spring-forward 2026-03-29: 01:00→04:00 wall is 2 real hours', () => {
    const a = wallToEpoch(2026, 3, 29, 1, 0)
    const b = wallToEpoch(2026, 3, 29, 4, 0)
    expect(b - a).toBe(2 * H)
  })

  it('fall-back 2026-10-25: 01:30→03:30 wall is 3 real hours', () => {
    const a = wallToEpoch(2026, 10, 25, 1, 30)
    const b = wallToEpoch(2026, 10, 25, 3, 30)
    expect(b - a).toBe(3 * H)
  })

  it('normalizes the nonexistent spring-forward time deterministically', () => {
    const ms = wallToEpoch(2026, 3, 29, 2, 30) // 02:30 never existed
    expect(Number.isFinite(ms)).toBe(true)
    // Whatever the platform resolves to, it is NOT rendered as the
    // nonexistent wall time — the editor echoes the resolved time back.
    expect(formatTime(ms)).not.toBe('02:30')
  })

  it('a regular winter day round-trips exactly', () => {
    const ms = wallToEpoch(2026, 1, 15, 14, 30)
    expect(formatDate(ms)).toBe('15-01-2026')
    expect(formatTime(ms)).toBe('14:30')
  })

  it('formats midnight as 00:00, never 24:00', () => {
    const ms = wallToEpoch(2026, 6, 10, 0, 0)
    expect(formatTime(ms)).toBe('00:00')
  })
})

describe('resolveMs', () => {
  const base = wallToEpoch(2026, 6, 9, 12, 0)

  it('prefers server time for small divergence (clock skew)', () => {
    expect(resolveMs({ ms: base, srv: srvStamp(base + MIN) })).toBe(base + MIN)
  })

  it('prefers client tap time for large divergence (offline queue delay)', () => {
    expect(resolveMs({ ms: base, srv: srvStamp(base + 3 * H) })).toBe(base)
  })

  it('uses ms when srv is null (manual edit / pending)', () => {
    expect(resolveMs({ ms: base, srv: null })).toBe(base)
  })

  it('boundary: exactly SKEW_LIMIT uses server', () => {
    expect(resolveMs({ ms: base, srv: srvStamp(base + SKEW_LIMIT_MS) })).toBe(
      base + SKEW_LIMIT_MS,
    )
  })
})

describe('day attribution and grouping', () => {
  it('ms/srv straddling a Copenhagen midnight groups by the resolved value', () => {
    const beforeMidnight = wallToEpoch(2026, 6, 9, 23, 59)
    const afterMidnight = wallToEpoch(2026, 6, 10, 0, 0)
    const stamp = { ms: beforeMidnight, srv: srvStamp(afterMidnight + 30_000) }
    // 90s divergence ≤ SKEW_LIMIT → server wins → next day
    const resolved = resolveMs(stamp)
    expect(dayKey(resolved)).toBe('2026-06-10')
    // Display uses the SAME resolved value → card can never sit under
    // Tuesday while showing a Wednesday time.
    expect(formatTime(resolved)).toBe('00:00')
  })

  it('dayKey is a Copenhagen calendar day', () => {
    // 23:30 UTC on 9 June = 01:30 on 10 June in Copenhagen (CEST)
    const utcLate = Date.UTC(2026, 5, 9, 23, 30)
    expect(dayKey(utcLate)).toBe('2026-06-10')
  })
})

describe('period ranges', () => {
  const wed = wallToEpoch(2026, 6, 10, 15, 0) // Wednesday

  it('dayRange covers [00:00, next 00:00)', () => {
    const { start, end } = dayRange(wed)
    expect(formatDate(start)).toBe('10-06-2026')
    expect(formatTime(start)).toBe('00:00')
    expect(end - start).toBe(24 * H)
  })

  it('weekRange is ISO Monday-first: 08-06-2026 … 14-06-2026, week 24', () => {
    const { start, end } = weekRange(wed)
    expect(formatDate(start)).toBe('08-06-2026')
    expect(formatDate(end)).toBe('15-06-2026') // exclusive
    expect(isoWeekNumber(wed)).toBe(24)
  })

  it('monthRange covers June 2026', () => {
    const { start, end } = monthRange(wed)
    expect(formatDate(start)).toBe('01-06-2026')
    expect(formatDate(end)).toBe('01-07-2026')
  })

  it('week containing a DST transition still has exact midnight bounds', () => {
    const inDstWeek = wallToEpoch(2026, 3, 27, 12, 0) // Fri before spring-forward Sunday
    const { start, end } = weekRange(inDstWeek)
    expect(formatDate(start)).toBe('23-03-2026')
    expect(formatTime(start)).toBe('00:00')
    expect(formatDate(end)).toBe('30-03-2026')
    expect(formatTime(end)).toBe('00:00')
    // That week is 1 hour shorter in real time
    expect(end - start).toBe(7 * 24 * H - H)
  })

  it('customRange is whole-days inclusive', () => {
    const from = wallToEpoch(2026, 6, 1, 9, 30)
    const to = wallToEpoch(2026, 6, 3, 22, 0)
    const { start, end } = customRange(from, to)
    expect(formatDate(start)).toBe('01-06-2026')
    expect(formatDate(end)).toBe('04-06-2026') // to + 1 day, exclusive
  })

  it('startOfDayTZ pins to Copenhagen midnight, not UTC midnight', () => {
    const utcEarly = Date.UTC(2026, 5, 9, 23, 30) // already 10 June in DK
    expect(formatDate(startOfDayTZ(utcEarly))).toBe('10-06-2026')
  })
})

describe('formatting', () => {
  it('formatDuration: hours and minutes', () => {
    expect(formatDuration(7 * H + 30 * MIN)).toBe('7 h 30 m')
    expect(formatDuration(45 * MIN)).toBe('45 m')
    expect(formatDuration(0)).toBe('0 m')
    expect(formatDuration(-5 * MIN)).toBe('0 m') // clamped
    expect(formatDuration(38 * H + 25 * MIN)).toBe('38 h 25 m')
  })

  it('formatTimer: H:MM:SS', () => {
    expect(formatTimer(0)).toBe('0:00:00')
    expect(formatTimer(7 * H + 5 * MIN + 9_000)).toBe('7:05:09')
    expect(formatTimer(-1000)).toBe('0:00:00')
  })

  it('formatDateTime: confirmation readout format', () => {
    expect(formatDateTime(wallToEpoch(2026, 6, 9, 14, 0))).toBe(
      'Tue 09-06-2026, 14:00',
    )
  })

  it('native input round-trip', () => {
    const ms = wallToEpoch(2026, 6, 9, 14, 5)
    expect(toDateInputValue(ms)).toBe('2026-06-09')
    expect(toTimeInputValue(ms)).toBe('14:05')
  })
})

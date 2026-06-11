import { TZDate } from '@date-fns/tz'
import {
  addDays,
  addMonths,
  addWeeks,
  getISOWeek,
  startOfISOWeek,
  startOfMonth,
} from 'date-fns'
import type { Stamp } from '../types'

/**
 * Single source of truth for the app's timezone. Display and day-grouping are
 * pinned here — never the device zone — so every device shows identical times
 * and day buckets, and a Copenhagen→London flight mid-shift changes nothing.
 */
export const TZ = 'Europe/Copenhagen'

export const SKEW_LIMIT_MS = 2 * 60_000
export const MAX_SHIFT_MS = 24 * 3_600_000
export const LONG_SHIFT_WARN_MS = 16 * 3_600_000
export const FORGOT_THRESHOLD_MS = 12 * 3_600_000

/**
 * Canonical Stamp resolution, used everywhere (queries are padded by
 * SKEW_LIMIT_MS and re-filtered on this value):
 * - small ms↔srv divergence = clock skew → the server is truth;
 * - large divergence = offline queue delay → the client tap time is truth.
 * Manual edits have srv == null, so the picked time is always authoritative.
 */
export function resolveMs(s: Stamp): number {
  if (s.srv && Math.abs(s.srv.toMillis() - s.ms) <= SKEW_LIMIT_MS) {
    return s.srv.toMillis()
  }
  return s.ms
}

type WallParts = { y: number; m: number; d: number; hh: number; mm: number }

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const weekdayFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'short',
})

/** Copenhagen wall-clock components of an epoch instant. */
export function wallParts(ms: number): WallParts {
  const p: Record<string, string> = {}
  for (const { type, value } of partsFmt.formatToParts(ms)) p[type] = value
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour),
    mm: Number(p.minute),
  }
}

/**
 * Copenhagen wall-clock → epoch ms. Spring-forward nonexistent times are
 * normalized deterministically by TZDate; callers echo the resolved time back
 * to the user. Fall-back ambiguous times accept the platform's resolution.
 */
export function wallToEpoch(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
): number {
  return new TZDate(y, m - 1, d, hh, mm, 0, 0, TZ).getTime()
}

const pad = (n: number) => String(n).padStart(2, '0')

/** DD-MM-YYYY */
export function formatDate(ms: number): string {
  const { y, m, d } = wallParts(ms)
  return `${pad(d)}-${pad(m)}-${y}`
}

/** HH:mm (24-hour) */
export function formatTime(ms: number): string {
  const { hh, mm } = wallParts(ms)
  return `${pad(hh)}:${pad(mm)}`
}

/** "Tue 09-06-2026, 14:00" — the confirmation readout next to pickers. */
export function formatDateTime(ms: number): string {
  return `${weekdayFmt.format(ms)} ${formatDate(ms)}, ${formatTime(ms)}`
}

/** "Tue 09-06-2026" — day group headers. */
export function formatDayHeader(ms: number): string {
  return `${weekdayFmt.format(ms)} ${formatDate(ms)}`
}

/** Durations as "7 h 30 m" / "45 m". Floors to whole minutes. */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} m`
  return `${h} h ${m} m`
}

/** Live timer "H:MM:SS". */
export function formatTimer(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${pad(m)}:${pad(s)}`
}

/**
 * Canonical day-attribution key (YYYY-MM-DD in Copenhagen): a shift belongs to
 * the calendar day of resolveMs(start). Used for query filtering, grouping AND
 * display — one rule, so day totals always sum exactly to week/month totals.
 */
export function dayKey(ms: number): string {
  const { y, m, d } = wallParts(ms)
  return `${y}-${pad(m)}-${pad(d)}`
}

export function startOfDayTZ(ms: number): number {
  const { y, m, d } = wallParts(ms)
  return wallToEpoch(y, m, d, 0, 0)
}

export function addDaysTZ(ms: number, n: number): number {
  return addDays(new TZDate(ms, TZ), n).getTime()
}

export type PeriodRange = { start: number; end: number } // [start, end)

export function dayRange(anchorMs: number): PeriodRange {
  const start = startOfDayTZ(anchorMs)
  return { start, end: addDaysTZ(start, 1) }
}

/** ISO-8601 week, Monday-first (Danish convention). */
export function weekRange(anchorMs: number): PeriodRange {
  const start = startOfISOWeek(new TZDate(anchorMs, TZ)).getTime()
  return { start, end: addWeeks(new TZDate(start, TZ), 1).getTime() }
}

export function monthRange(anchorMs: number): PeriodRange {
  const start = startOfMonth(new TZDate(anchorMs, TZ)).getTime()
  return { start, end: addMonths(new TZDate(start, TZ), 1).getTime() }
}

/** Whole-days-inclusive custom range: [from 00:00, to + 1 day 00:00). */
export function customRange(fromDayMs: number, toDayMs: number): PeriodRange {
  return { start: startOfDayTZ(fromDayMs), end: addDaysTZ(startOfDayTZ(toDayMs), 1) }
}

export function isoWeekNumber(ms: number): number {
  return getISOWeek(new TZDate(ms, TZ))
}

/** Parse "YYYY-MM-DD" (native <input type="date"> value) to {y, m, d}. */
export function parseDateInput(
  value: string,
): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

/** Parse "HH:mm" (native <input type="time"> value). */
export function parseTimeInput(value: string): { hh: number; mm: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  return { hh: Number(m[1]), mm: Number(m[2]) }
}

/** Epoch → native input values in Copenhagen wall time. */
export function toDateInputValue(ms: number): string {
  return dayKey(ms)
}

export function toTimeInputValue(ms: number): string {
  return formatTime(ms)
}

/**
 * Resolve a time-of-day to the unique instant within [windowStart, windowEnd]
 * — well-defined because shifts are hard-capped below 24 h. Break editors use
 * time-only inputs; this picks the right side of midnight for overnight
 * shifts. Falls back to the window-start day (so validation can say "outside
 * the shift" rather than "missing input") when neither candidate fits.
 */
export function resolveTimeWithin(
  hh: number,
  mm: number,
  windowStartMs: number,
  windowEndMs: number,
): number {
  const { y, m, d } = wallParts(windowStartMs)
  const sameDay = wallToEpoch(y, m, d, hh, mm)
  for (const candidate of [sameDay, wallToEpoch(y, m, d + 1, hh, mm)]) {
    if (candidate >= windowStartMs && candidate <= windowEndMs) return candidate
  }
  return sameDay
}

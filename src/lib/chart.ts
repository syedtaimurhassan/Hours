import type { Shift } from '../types'
import { workedMs } from './durations'
import {
  TZ,
  addDaysTZ,
  dayKey,
  isoWeekNumber,
  resolveMs,
  startOfDayTZ,
} from './time'

export type Bucket = {
  key: string
  label: string
  workedMs: number
  isCurrent: boolean
}

const weekdayFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'narrow',
})

/**
 * Worked-time buckets for the dashboard bar chart. Each shift contributes its
 * full worked time to its START day (same attribution as the totals, so the
 * bars sum to the period total). ≤ ~16 days → one bar per day; longer → one
 * bar per ISO week. Returns [] for a single day (chart hidden).
 */
export function buildBuckets(
  shifts: Shift[],
  startMs: number,
  endMs: number,
  nowMs: number,
): Bucket[] {
  // Per-day worked totals across the range.
  const perDay = new Map<string, number>()
  const days: number[] = []
  for (let d = startOfDayTZ(startMs); d < endMs; d = addDaysTZ(d, 1)) {
    perDay.set(dayKey(d), 0)
    days.push(d)
  }
  if (days.length <= 1) return []

  for (const s of shifts) {
    if (s.deleted) continue
    const k = dayKey(resolveMs(s.start))
    if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + workedMs(s, nowMs))
  }

  const todayKey = dayKey(nowMs)

  // ≤ 16 day-bars: one bar per day.
  if (days.length <= 16) {
    return days.map((d) => {
      const k = dayKey(d)
      return {
        key: k,
        label: weekdayFmt.format(d),
        workedMs: perDay.get(k) ?? 0,
        isCurrent: k === todayKey,
      }
    })
  }

  // Longer ranges: bucket by ISO week.
  const weeks = new Map<string, Bucket>()
  const order: string[] = []
  const nowWeek = `${isoWeekNumber(nowMs)}`
  for (const d of days) {
    const wk = `${isoWeekNumber(d)}`
    let bucket = weeks.get(wk)
    if (!bucket) {
      bucket = { key: wk, label: `W${wk}`, workedMs: 0, isCurrent: wk === nowWeek }
      weeks.set(wk, bucket)
      order.push(wk)
    }
    bucket.workedMs += perDay.get(dayKey(d)) ?? 0
  }
  return order.map((wk) => weeks.get(wk)!)
}

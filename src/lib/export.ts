import { effectiveEndMs, breakMs, shiftMs, workedMs } from './durations'
import { formatDate, formatTime, resolveMs } from './time'
import type { Shift } from '../types'

const hours = (ms: number) => (ms / 3_600_000).toFixed(2)

function csvCell(v: string): string {
  // Quote if it contains comma, quote, or newline; double internal quotes.
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * Period shifts → CSV (one row per shift). Columns chosen to match a payroll
 * timesheet: Date, Job, Start, End, Shift h, Break h, Worked h. Durations in
 * decimal hours (epoch-derived, so DST-correct). Sorted oldest-first.
 */
export function shiftsToCsv(
  shifts: Shift[],
  jobName: (jobId: string | null) => string,
  nowMs: number,
): string {
  const header = ['Date', 'Job', 'Start', 'End', 'Shift (h)', 'Break (h)', 'Worked (h)']
  const rows = [...shifts]
    .filter((s) => !s.deleted)
    .sort((a, b) => resolveMs(a.start) - resolveMs(b.start))
    .map((s) => {
      const start = resolveMs(s.start)
      const end = effectiveEndMs(s)
      return [
        formatDate(start),
        jobName(s.jobId),
        formatTime(start),
        end === null ? 'running' : formatTime(end),
        hours(shiftMs(s, nowMs)),
        hours(breakMs(s, nowMs)),
        hours(workedMs(s, nowMs)),
      ]
    })
  return [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')
}

/** Trigger a client-side download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

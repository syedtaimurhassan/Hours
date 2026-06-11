import { formatDuration, parseTimeInput, resolveTimeWithin, toTimeInputValue } from '../lib/time'
import { TimeField } from './TimeField'

export type BreakRow = { id: string; start: string; end: string } // HH:mm inputs

/**
 * Break rows are time-only — each HH:mm resolves to the unique instant inside
 * the shift window (shifts are capped < 24 h). One-tap presets cover the
 * common case: retro-adding the forgotten lunch must not cost 6–8 taps.
 */
export function BreakEditor({
  rows,
  onChange,
  errors,
  windowStartMs,
  windowEndMs,
}: {
  rows: BreakRow[]
  onChange: (rows: BreakRow[]) => void
  errors: Record<string, string>
  windowStartMs: number | null
  windowEndMs: number | null
}) {
  const addPreset = (durMin: number) => {
    if (windowStartMs === null || windowEndMs === null) return
    // Auto-place mid-shift, immediately editable.
    const durMs = durMin * 60_000
    const mid = windowStartMs + (windowEndMs - windowStartMs) / 2
    let start = Math.round((mid - durMs / 2) / 60_000) * 60_000
    start = Math.max(windowStartMs, Math.min(start, windowEndMs - durMs))
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        start: toTimeInputValue(start),
        end: toTimeInputValue(Math.min(start + durMs, windowEndMs)),
      },
    ])
  }

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold tracking-wide text-secondary uppercase">
        Breaks
      </span>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.id}>
            <div className="flex items-center gap-2">
              <TimeField
                ariaLabel="Break start time"
                value={row.start}
                invalid={Boolean(errors[row.id])}
                onChange={(t) =>
                  onChange(rows.map((r) => (r.id === row.id ? { ...r, start: t } : r)))
                }
              />
              <span className="text-tertiary">–</span>
              <TimeField
                ariaLabel="Break end time"
                value={row.end}
                invalid={Boolean(errors[row.id])}
                onChange={(t) =>
                  onChange(rows.map((r) => (r.id === row.id ? { ...r, end: t } : r)))
                }
              />
              <button
                type="button"
                aria-label="Remove break"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-secondary active:bg-fill"
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
              >
                ✕
              </button>
            </div>
            {errors[row.id] && (
              <p className="mt-1 text-[13px] text-red-600">{errors[row.id]}</p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-secondary">Add break:</span>
        {[30, 45, 60].map((min) => (
          <button
            key={min}
            type="button"
            className="min-h-10 rounded-full border border-separator bg-card px-4 text-[15px] font-medium text-label active:bg-fill"
            onClick={() => addPreset(min)}
          >
            {min === 60 ? '1 h' : formatDuration(min * 60_000)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Resolve a row to epoch within the window; null when input is incomplete. */
export function rowToBreakDraft(
  row: BreakRow,
  windowStartMs: number | null,
  windowEndMs: number | null,
): { id: string; startMs: number | null; endMs: number | null } {
  if (windowStartMs === null || windowEndMs === null) {
    return { id: row.id, startMs: null, endMs: null }
  }
  const start = parseTimeInput(row.start)
  const end = parseTimeInput(row.end)
  const startMs = start
    ? resolveTimeWithin(start.hh, start.mm, windowStartMs, windowEndMs)
    : null
  // The end resolves within [break start, window end] so a break can span
  // midnight inside an overnight shift.
  const endMs =
    end === null
      ? null
      : resolveTimeWithin(end.hh, end.mm, startMs ?? windowStartMs, windowEndMs)
  return { id: row.id, startMs, endMs }
}

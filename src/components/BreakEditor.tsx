import { formatDuration, parseTimeInput, resolveTimeWithin, toTimeInputValue } from '../lib/time'

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
      <span className="mb-1 block text-sm font-medium text-slate-700">
        Breaks
      </span>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.id}>
            <div className="flex items-center gap-2">
              <input
                type="time"
                step={60}
                aria-label="Break start time"
                className={`min-h-11 flex-1 rounded-lg border bg-white px-3 py-2 text-base ${errors[row.id] ? 'border-red-400' : 'border-slate-300'}`}
                value={row.start}
                onChange={(e) =>
                  onChange(
                    rows.map((r) =>
                      r.id === row.id ? { ...r, start: e.target.value } : r,
                    ),
                  )
                }
              />
              <span className="text-slate-400">–</span>
              <input
                type="time"
                step={60}
                aria-label="Break end time"
                className={`min-h-11 flex-1 rounded-lg border bg-white px-3 py-2 text-base ${errors[row.id] ? 'border-red-400' : 'border-slate-300'}`}
                value={row.end}
                onChange={(e) =>
                  onChange(
                    rows.map((r) =>
                      r.id === row.id ? { ...r, end: e.target.value } : r,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label="Remove break"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
              >
                ✕
              </button>
            </div>
            {errors[row.id] && (
              <p className="mt-1 text-sm text-red-600">{errors[row.id]}</p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Add break:</span>
        {[30, 45, 60].map((min) => (
          <button
            key={min}
            type="button"
            className="min-h-11 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100"
            onClick={() => addPreset(min)}
          >
            {formatDuration(min * 60_000)}
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

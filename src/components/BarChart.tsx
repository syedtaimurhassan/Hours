import { formatDuration } from '../lib/time'
import type { Bucket } from '../lib/chart'

/**
 * Lightweight CSS bar chart of worked time per bucket — no chart library.
 * The tallest bar sets the scale; the current day/week is accented.
 */
export function BarChart({ buckets }: { buckets: Bucket[] }) {
  if (buckets.length === 0) return null
  const max = Math.max(...buckets.map((b) => b.workedMs), 1)
  const peak = buckets.reduce((a, b) => (b.workedMs > a.workedMs ? b : a))

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 pt-3 pb-2 shadow-xs">
      <div className="flex items-end justify-between gap-1" style={{ height: 96 }}>
        {buckets.map((b) => {
          const pct = Math.round((b.workedMs / max) * 100)
          const hasValue = b.workedMs > 0
          return (
            <div
              key={b.key}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
              title={`${b.label}: ${formatDuration(b.workedMs)}`}
            >
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className={`w-full max-w-7 rounded-md transition-[height] ${
                    b.isCurrent
                      ? 'bg-emerald-500'
                      : hasValue
                        ? 'bg-emerald-200'
                        : 'bg-slate-100'
                  }`}
                  style={{ height: `${hasValue ? Math.max(pct, 4) : 3}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between gap-1">
        {buckets.map((b) => (
          <span
            key={b.key}
            className={`min-w-0 flex-1 truncate text-center text-[11px] ${
              b.isCurrent ? 'font-semibold text-emerald-700' : 'text-slate-400'
            }`}
          >
            {b.label}
          </span>
        ))}
      </div>
      {peak.workedMs > 0 && (
        <p className="mt-1 text-center text-xs text-slate-400">
          Best: {peak.label} · {formatDuration(peak.workedMs)}
        </p>
      )}
    </div>
  )
}

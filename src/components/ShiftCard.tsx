import { breakMs, shiftMs, workedMs } from '../lib/durations'
import { dayKey, formatDuration, formatTime, resolveMs } from '../lib/time'
import type { Shift } from '../types'

export type ShiftBadge = 'syncing' | 'badTimes' | 'overlap'

/**
 * One vocabulary everywhere: "Worked" = net, "Shift" = gross, "Breaks" =
 * breaks. The same card renders in Today and History — one code path, the
 * two views can never disagree.
 */
export function ShiftCard({
  shift,
  nowMs,
  endMs,
  badges = [],
  startedYesterdayLabel,
  onTap,
}: {
  shift: Shift
  nowMs: number
  /** effectiveEndMs(shift), passed in to keep derivation in one place. */
  endMs: number | null
  badges?: ShiftBadge[]
  /** Set on the active card in Today when it started before today. */
  startedYesterdayLabel?: string
  onTap?: () => void
}) {
  const startMs = resolveMs(shift.start)
  const running = endMs === null
  const overnight = !running && dayKey(endMs) !== dayKey(startMs)
  const worked = workedMs(shift, nowMs)
  const gross = shiftMs(shift, nowMs)
  const breaks = breakMs(shift, nowMs)

  return (
    <button
      type="button"
      onClick={onTap}
      className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-xs active:bg-slate-50"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-medium text-slate-900 tabular-digits">
          {formatTime(startMs)} –{' '}
          {running ? (
            <span className="text-emerald-700">now</span>
          ) : (
            <>
              {formatTime(endMs)}
              {overnight && (
                <sup className="ml-0.5 text-xs text-slate-500" title="Ends the next day">
                  +1
                </sup>
              )}
            </>
          )}
        </span>
        <span className="text-base font-semibold text-slate-900">
          Worked {formatDuration(worked)}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
        <span>
          Shift {formatDuration(gross)} · Breaks {formatDuration(breaks)}
        </span>
        {startedYesterdayLabel && (
          <span className="text-amber-700">{startedYesterdayLabel}</span>
        )}
        {badges.includes('syncing') && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
            ⏳ syncing
          </span>
        )}
        {badges.includes('badTimes') && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
            ⚠ Check times
          </span>
        )}
        {badges.includes('overlap') && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
            ⚠ Overlap
          </span>
        )}
      </div>
    </button>
  )
}

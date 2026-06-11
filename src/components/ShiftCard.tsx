import { breakMs, shiftMs, workedMs } from '../lib/durations'
import { swatch } from '../lib/jobs'
import { dayKey, formatDuration, formatTime, resolveMs } from '../lib/time'
import type { Job, Shift } from '../types'

export type ShiftBadge = 'syncing' | 'badTimes' | 'overlap'

/**
 * One vocabulary everywhere: "Worked" = net, "Shift" = gross, "Breaks" =
 * breaks. The same card renders in Today and History — one code path, the
 * two views can never disagree. A job color stripe + name gives at-a-glance
 * grouping when multiple jobs are in use.
 */
export function ShiftCard({
  shift,
  job,
  nowMs,
  endMs,
  badges = [],
  startedYesterdayLabel,
  onTap,
}: {
  shift: Shift
  job?: Job | undefined
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
  const sw = job ? swatch(job.color) : null

  return (
    <button
      type="button"
      onClick={onTap}
      className="relative flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white py-3 pr-4 pl-4 text-left shadow-xs transition active:scale-[0.99] active:bg-slate-50"
    >
      {/* Job color accent stripe */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1.5 ${sw ? sw.dot : running ? 'bg-emerald-400' : 'bg-slate-200'}`}
      />
      <div className="min-w-0 flex-1 pl-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-slate-900 tabular-digits">
            {formatTime(startMs)}
            <span className="mx-1 font-normal text-slate-400">–</span>
            {running ? (
              <span className="font-semibold text-emerald-600">now</span>
            ) : (
              <>
                {formatTime(endMs)}
                {overnight && (
                  <sup className="ml-0.5 text-xs font-normal text-slate-400" title="Ends the next day">
                    +1
                  </sup>
                )}
              </>
            )}
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-base font-bold text-slate-900 tabular-digits">
              {formatDuration(worked)}
            </span>
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
          {job && (
            <span className={`inline-flex items-center gap-1 font-medium ${sw!.softText}`}>
              <span className={`h-2 w-2 rounded-full ${sw!.dot}`} />
              {job.name}
            </span>
          )}
          <span className="tabular-digits">
            {formatDuration(gross)} shift
            {breaks > 0 && <> · {formatDuration(breaks)} break</>}
          </span>
          {startedYesterdayLabel && (
            <span className="font-medium text-amber-700">{startedYesterdayLabel}</span>
          )}
          {badges.includes('syncing') && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
              ⏳ syncing
            </span>
          )}
          {badges.includes('badTimes') && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              ⚠ Check times
            </span>
          )}
          {badges.includes('overlap') && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              ⚠ Overlap
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

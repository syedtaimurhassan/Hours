import { memo } from 'react'
import { breakMs, shiftMs } from '../lib/durations'
import { swatch } from '../lib/jobs'
import { dayKey, formatDuration, formatTime, resolveMs } from '../lib/time'
import { useNow } from '../lib/useNow'
import type { Job, Shift } from '../types'
import { LiveWorked } from './Live'

export type ShiftBadge = 'syncing' | 'badTimes' | 'overlap'

/**
 * One shift as an iOS list row — placed inside a ListGroup, hairline-divided.
 * Self-contained timing: a running row ticks internally via useNow, so the
 * surrounding dashboard never re-renders on its account. Memoized so unrelated
 * snapshot updates don't touch it.
 */
export const ShiftCard = memo(function ShiftCard({
  shift,
  job,
  endMs,
  badges = [],
  startedYesterdayLabel,
  onTap,
}: {
  shift: Shift
  job?: Job | undefined
  /** effectiveEndMs(shift) — null while running. */
  endMs: number | null
  badges?: ShiftBadge[]
  startedYesterdayLabel?: string
  onTap?: () => void
}) {
  const running = endMs === null
  const now = useNow(running) // ticks only for a running row
  const startMs = resolveMs(shift.start)
  const overnight = !running && dayKey(endMs) !== dayKey(startMs)
  const gross = shiftMs(shift, now)
  const breaks = breakMs(shift, now)
  const sw = job ? swatch(job.color) : null

  return (
    <button
      type="button"
      onClick={onTap}
      className="flex min-h-[58px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-fill"
    >
      <span
        aria-hidden
        className={`h-9 w-1 shrink-0 rounded-full ${sw ? sw.dot : running ? 'bg-brand' : 'bg-tertiary'}`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-medium text-label tabular-digits">
          {formatTime(startMs)}
          <span className="mx-1 text-tertiary">–</span>
          {running ? (
            <span className="font-semibold text-brand-deep">now</span>
          ) : (
            <>
              {formatTime(endMs)}
              {overnight && (
                <sup className="ml-0.5 text-[11px] font-normal text-tertiary">+1</sup>
              )}
            </>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-secondary">
          {job && (
            <span className={`font-medium ${sw!.softText}`}>{job.name}</span>
          )}
          <span className="tabular-digits">
            {formatDuration(gross)}
            {breaks > 0 && <> · {formatDuration(breaks)} break</>}
          </span>
          {startedYesterdayLabel && (
            <span className="font-medium text-amber-600">{startedYesterdayLabel}</span>
          )}
          {badges.includes('syncing') && <Pill tone="amber">syncing</Pill>}
          {badges.includes('badTimes') && <Pill tone="red">check times</Pill>}
          {badges.includes('overlap') && <Pill tone="red">overlap</Pill>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[17px] font-semibold text-label">
          <LiveWorked shift={shift} live={running} />
        </div>
      </div>
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-tertiary" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  )
})

function Pill({ tone, children }: { tone: 'amber' | 'red'; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
      }`}
    >
      {children}
    </span>
  )
}

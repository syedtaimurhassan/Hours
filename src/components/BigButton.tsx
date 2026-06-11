import { useState } from 'react'
import { formatTime } from '../lib/time'
import type { Job, Shift } from '../types'
import { LiveElapsedSince, LiveTimer } from './Live'

export type BigButtonState =
  | { kind: 'idle' }
  | {
      kind: 'running'
      shift: Shift // the timer ticks internally from this — parent stays static
      startMs: number
      startedYesterday: boolean
      onBreak: { sinceMs: number } | null
    }
  | { kind: 'pending'; label: string }

/**
 * The one big control. Label is always an action verb. The ticking timer lives
 * in a LiveTimer leaf, so the screen around the button does not re-render each
 * second. A swallowed tap (during the settle window) shakes instead of doing
 * nothing silently.
 */
export function BigButton({
  state,
  settling,
  job,
  onTap,
  onSwallowedTap,
}: {
  state: BigButtonState
  settling: boolean
  job?: Job | undefined
  onTap: () => void
  onSwallowedTap: () => void
}) {
  const [shake, setShake] = useState(0)

  const handleTap = () => {
    if (state.kind === 'pending') return
    if (settling) {
      setShake((n) => n + 1)
      onSwallowedTap()
      return
    }
    onTap()
  }

  const aria =
    state.kind === 'idle'
      ? 'Start shift'
      : state.kind === 'pending'
        ? state.label
        : 'End shift'

  const gradient =
    state.kind === 'idle'
      ? 'from-brand to-brand-deep'
      : state.kind === 'pending'
        ? 'from-slate-400 to-slate-500'
        : state.onBreak
          ? 'from-amber-400 to-amber-500'
          : 'from-rose-500 to-red-600'
  const halo =
    state.kind === 'idle'
      ? 'ring-[#34c75922]'
      : state.kind === 'pending'
        ? 'ring-slate-200/40'
        : state.onBreak
          ? 'ring-amber-200/40'
          : 'ring-red-200/40'

  return (
    <div className="flex flex-col items-center">
      {state.kind === 'running' && state.onBreak && (
        <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-[15px] font-semibold text-amber-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          On break · <LiveElapsedSince since={state.onBreak.sinceMs} />
        </span>
      )}

      <div
        className={`rounded-full p-2.5 ring-[10px] ${halo} ${state.kind === 'running' && !state.onBreak ? 'pulse-running' : ''}`}
      >
        <button
          type="button"
          aria-label={aria}
          onClick={handleTap}
          data-shake={shake}
          onAnimationEnd={() => setShake(0)}
          className={`relative flex aspect-square w-64 max-w-[74vw] flex-col items-center justify-center rounded-full bg-gradient-to-b ${gradient} text-white shadow-[0_10px_30px_-6px_rgb(0_0_0/0.25)] transition-transform active:scale-[0.97] select-none ${shake ? 'shake-once' : ''} ${settling ? 'settling' : ''}`}
        >
          {state.kind === 'idle' && (
            <>
              <PlayIcon />
              <span className="mt-2 text-[26px] font-bold tracking-tight">Start</span>
              {job && <span className="mt-0.5 text-[15px] font-medium text-white/85">{job.name}</span>}
            </>
          )}
          {state.kind === 'pending' && (
            <>
              <Spinner />
              <span className="mt-3 text-[19px] font-semibold">{state.label}</span>
            </>
          )}
          {state.kind === 'running' && (
            <>
              <span className="text-[13px] font-semibold tracking-[0.15em] text-white/80 uppercase">
                {state.onBreak ? 'Paused' : 'Working'}
              </span>
              <span className="mt-1 text-[2.9rem] leading-none font-bold tracking-tight">
                <LiveTimer shift={state.shift} />
              </span>
              <span className="mt-2 text-[15px] font-semibold">Tap to end</span>
              <span className="mt-0.5 text-[12px] text-white/80">
                from {state.startedYesterday ? 'yesterday ' : ''}
                {formatTime(state.startMs)}
                {job ? ` · ${job.name}` : ''}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function PlayIcon() {
  // Nudged right ~1.5px so the triangle reads optically centered.
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-10 w-10 translate-x-[2px]" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 001.52.85l10-6.5a1 1 0 000-1.7l-10-6.5A1 1 0 008 5.5z" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg aria-hidden className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

import { useState } from 'react'
import { formatDuration, formatTime } from '../lib/time'
import type { Job } from '../types'
import { ElapsedTimer } from './ElapsedTimer'

export type BigButtonState =
  | { kind: 'idle'; firstRun: boolean }
  | {
      kind: 'running'
      elapsedMs: number // net worked — the one primary timer
      startMs: number
      startedYesterday: boolean
      onBreak: { sinceMs: number } | null
    }
  | { kind: 'pending'; label: string }

/**
 * The one big button. Its label is ALWAYS an action verb — a status-labeled
 * button users must guess at is banned. State is carried by text, never
 * color alone. While settling after a state change, a swallowed tap shakes
 * the button and nods to the snackbar instead of silently doing nothing.
 */
export function BigButton({
  state,
  settling,
  nowMs,
  job,
  onTap,
  onSwallowedTap,
}: {
  state: BigButtonState
  /** Within the 1.5 s debounce window after a state change. */
  settling: boolean
  nowMs: number
  /** The job for the running shift (or the one that will be started). */
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
        : state.onBreak
          ? 'End shift (on break)'
          : 'End shift'

  // Color theme per state — gradient for the fill, ring for the soft halo.
  const gradient =
    state.kind === 'idle'
      ? 'from-emerald-500 to-emerald-600'
      : state.kind === 'pending'
        ? 'from-slate-500 to-slate-600'
        : state.onBreak
          ? 'from-amber-400 to-amber-500'
          : 'from-rose-500 to-red-600'
  const halo =
    state.kind === 'idle'
      ? 'ring-emerald-100'
      : state.kind === 'pending'
        ? 'ring-slate-100'
        : state.onBreak
          ? 'ring-amber-100'
          : 'ring-red-100'

  return (
    <div className="flex flex-col items-center">
      {state.kind === 'running' && state.onBreak && (
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          On break · {formatDuration(nowMs - state.onBreak.sinceMs)}
        </span>
      )}

      {/* Soft halo ring around the button for depth */}
      <div
        className={`rounded-full p-2 ring-8 ${halo} ${
          state.kind === 'running' && !state.onBreak ? 'pulse-running' : ''
        }`}
      >
        <button
          type="button"
          aria-label={aria}
          onClick={handleTap}
          data-shake={shake}
          onAnimationEnd={() => setShake(0)}
          className={`relative flex aspect-square w-60 max-w-[72vw] flex-col items-center justify-center rounded-full bg-gradient-to-b ${gradient} text-white shadow-xl transition-transform active:scale-95 select-none ${
            shake ? 'shake-once' : ''
          } ${settling ? 'settling' : ''}`}
        >
          {state.kind === 'idle' && (
            <>
              <PlayIcon />
              <span className="mt-2 text-2xl font-bold tracking-tight">Start shift</span>
              {job && (
                <span className="mt-1 text-sm font-medium text-white/85">{job.name}</span>
              )}
            </>
          )}
          {state.kind === 'pending' && (
            <>
              <Spinner />
              <span className="mt-3 text-xl font-semibold">{state.label}</span>
            </>
          )}
          {state.kind === 'running' && (
            <>
              <span className="text-sm font-medium tracking-widest text-white/80 uppercase">
                {state.onBreak ? 'Paused' : 'Working'}
              </span>
              <span className="mt-0.5 text-[2.75rem] leading-none font-bold tracking-tight">
                <ElapsedTimer ms={state.elapsedMs} />
              </span>
              <span className="mt-2 text-sm font-semibold tracking-wide">Tap to end</span>
              <span className="mt-0.5 text-xs text-white/80">
                Started {state.startedYesterday ? 'yesterday ' : ''}
                {formatTime(state.startMs)}
                {job ? ` · ${job.name}` : ''}
              </span>
            </>
          )}
        </button>
      </div>

      {state.kind === 'idle' && state.firstRun && (
        <p className="mt-5 text-sm text-slate-500">Tap to start your first shift.</p>
      )}
    </div>
  )
}

function PlayIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-9 w-9" fill="currentColor">
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

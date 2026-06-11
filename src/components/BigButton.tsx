import { useEffect, useRef, useState } from 'react'
import { formatDuration, formatTime } from '../lib/time'
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
  onTap,
  onSwallowedTap,
}: {
  state: BigButtonState
  /** Within the 1.5 s debounce window after a state change. */
  settling: boolean
  nowMs: number
  onTap: () => void
  onSwallowedTap: () => void
}) {
  const [shake, setShake] = useState(0)
  const lastStateKind = useRef(state.kind)
  useEffect(() => {
    lastStateKind.current = state.kind
  }, [state.kind])

  const handleTap = () => {
    if (state.kind === 'pending') return
    if (settling) {
      setShake((n) => n + 1)
      onSwallowedTap()
      return
    }
    onTap()
  }

  const base =
    'relative mx-auto flex aspect-square w-[70%] max-w-72 flex-col items-center justify-center rounded-full text-white shadow-lg transition-colors select-none'
  const aria =
    state.kind === 'idle'
      ? 'Start shift'
      : state.kind === 'pending'
        ? state.label
        : state.onBreak
          ? 'End shift (on break)'
          : 'End shift'

  return (
    <div className="flex flex-col items-center">
      {state.kind === 'running' && state.onBreak && (
        <span className="mb-3 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
          On break · {formatDuration(nowMs - state.onBreak.sinceMs)}
        </span>
      )}
      <button
        type="button"
        aria-label={aria}
        onClick={handleTap}
        data-shake={shake}
        className={`${base} ${shake ? 'shake-once' : ''} ${settling ? 'settling' : ''} ${
          state.kind === 'idle'
            ? 'bg-emerald-600 active:bg-emerald-700'
            : state.kind === 'pending'
              ? 'bg-slate-500'
              : state.onBreak
                ? 'bg-amber-500 active:bg-amber-600'
                : 'pulse-running bg-red-600 active:bg-red-700'
        }`}
        // Re-trigger the shake animation on every swallowed tap.
        onAnimationEnd={() => setShake(0)}
      >
        {state.kind === 'idle' && (
          <span className="text-2xl font-semibold">Start shift</span>
        )}
        {state.kind === 'pending' && (
          <>
            <Spinner />
            <span className="mt-2 text-xl font-semibold">{state.label}</span>
          </>
        )}
        {state.kind === 'running' && (
          <>
            <span className="text-2xl font-semibold">End shift</span>
            <span className="mt-1 text-4xl font-bold">
              <ElapsedTimer ms={state.elapsedMs} />
            </span>
            <span className="mt-1 text-sm opacity-90">
              Started {state.startedYesterday ? 'yesterday ' : ''}
              {formatTime(state.startMs)}
            </span>
          </>
        )}
      </button>
      {state.kind === 'idle' && state.firstRun && (
        <p className="mt-4 text-sm text-slate-500">
          Tap to start your first shift.
        </p>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg
      aria-hidden
      className="h-8 w-8 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M22 12a10 10 0 00-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

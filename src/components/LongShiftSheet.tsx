import { useState } from 'react'
import {
  MAX_SHIFT_MS,
  formatDateTime,
  formatDuration,
  resolveMs,
  toDateInputValue,
  toTimeInputValue,
} from '../lib/time'
import { useSheetBackButton } from '../lib/useSheetBackButton'
import type { Shift } from '../types'
import { DateTimeField, draftToMs, type DateTimeDraft } from './DateTimeField'
import { Sheet } from './EditShiftSheet'

/**
 * Forgot-to-end recovery (>12 h): intercepts the End tap (and Start taps
 * while a forgotten shift runs elsewhere) so a morning-rush tap can't
 * silently book a 15 h shift. Never auto-ends, never silently discards.
 */
export function LongShiftSheet({
  shift,
  nowMs,
  startingNew,
  onEndNow,
  onPickEnd,
  onDiscard,
  onClose,
}: {
  shift: Shift
  nowMs: number
  /** True when this sheet interrupted a Start tap (shift left running elsewhere). */
  startingNew: boolean
  onEndNow: () => void
  onPickEnd: (endMs: number) => void
  onDiscard: () => void
  onClose: () => void
}) {
  const startMs = resolveMs(shift.start)
  // Plausible prefill: start + 8 h.
  const prefill = Math.min(startMs + 8 * 3_600_000, nowMs)
  const [draft, setDraft] = useState<DateTimeDraft>({
    date: toDateInputValue(prefill),
    time: toTimeInputValue(prefill),
  })
  const [picking, setPicking] = useState(false)
  useSheetBackButton(true, onClose)

  const pickedMs = draftToMs(draft)
  const pickError =
    pickedMs === null
      ? 'Enter a date and time.'
      : pickedMs <= startMs
        ? 'End must be after start.'
        : pickedMs > nowMs + 60_000
          ? 'End time is in the future.'
          : pickedMs - startMs >= MAX_SHIFT_MS
            ? 'Shifts must be under 24 hours.'
            : null

  return (
    <Sheet onRequestClose={onClose}>
      <h2 className="text-lg font-semibold text-slate-900">
        {startingNew ? 'A shift is still running' : 'Still working?'}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        This shift has run {formatDuration(nowMs - startMs)} — started{' '}
        {formatDateTime(startMs)}.
        {startingNew && ' When did it end?'}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {!picking ? (
          <>
            {!startingNew && (
              <button
                type="button"
                className="min-h-12 rounded-xl bg-red-600 text-base font-semibold text-white active:bg-red-700"
                onClick={onEndNow}
              >
                End now
              </button>
            )}
            <button
              type="button"
              className="min-h-12 rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-800 active:bg-slate-100"
              onClick={() => setPicking(true)}
            >
              Pick the real end time…
            </button>
            <button
              type="button"
              className="min-h-12 rounded-xl text-base font-medium text-red-600 active:bg-red-50"
              onClick={() => {
                if (
                  window.confirm(
                    'Discard this shift entirely? You can undo right after.',
                  )
                ) {
                  onDiscard()
                }
              }}
            >
              Discard shift
            </button>
            <button
              type="button"
              className="min-h-11 text-sm font-medium text-slate-500"
              onClick={onClose}
            >
              {startingNew ? 'Cancel' : 'Keep working'}
            </button>
          </>
        ) : (
          <>
            <DateTimeField
              label="Shift ended at"
              value={draft}
              onChange={(v) => setDraft(v)}
              error={pickError ?? undefined}
              dateMax={toDateInputValue(nowMs)}
            />
            <button
              type="button"
              disabled={pickError !== null}
              className="min-h-12 rounded-xl bg-emerald-600 text-base font-semibold text-white disabled:opacity-40"
              onClick={() => pickedMs !== null && onPickEnd(pickedMs)}
            >
              Save end time
            </button>
            <button
              type="button"
              className="min-h-11 text-sm font-medium text-slate-500"
              onClick={() => setPicking(false)}
            >
              Back
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}

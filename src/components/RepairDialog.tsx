import { useState } from 'react'
import {
  formatDateTime,
  resolveMs,
  toDateInputValue,
  toTimeInputValue,
} from '../lib/time'
import type { Shift } from '../types'
import { DateTimeField, draftToMs, type DateTimeDraft } from './DateTimeField'

/**
 * Rule 1: two shifts were started while offline (unpreventable). Mandatory
 * guided repair — keep the earliest, close it at the newer one's start time
 * (editable). Never auto-resolved, never silently discarded.
 */
export function RepairDialog({
  shifts,
  onResolve,
}: {
  /** The open shifts, earliest first (≥ 2). */
  shifts: Shift[]
  onResolve: (earliest: Shift, endMs: number) => void
}) {
  const earliest = shifts[0]
  const next = shifts[1]
  const earliestStart = resolveMs(earliest.start)
  const prefill = resolveMs(next.start)
  const [draft, setDraft] = useState<DateTimeDraft>({
    date: toDateInputValue(prefill),
    time: toTimeInputValue(prefill),
  })
  const [resolving, setResolving] = useState(false)

  const pickedMs = draftToMs(draft)
  const error =
    pickedMs === null
      ? 'Enter a date and time.'
      : pickedMs <= earliestStart
        ? 'End must be after the start.'
        : pickedMs > prefill
          ? 'Must end before the newer shift started.'
          : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {shifts.length} shifts were started while offline
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Only one shift can run at a time. Keep the newer one (started{' '}
          {formatDateTime(prefill)}) and close the older one (started{' '}
          {formatDateTime(earliestStart)}):
        </p>
        <div className="mt-4">
          <DateTimeField
            label="Older shift ended at"
            value={draft}
            onChange={(v) => setDraft(v)}
            error={error ?? undefined}
          />
        </div>
        <button
          type="button"
          disabled={error !== null || resolving}
          className="mt-4 min-h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white disabled:opacity-40"
          onClick={() => {
            if (pickedMs === null || resolving) return
            setResolving(true)
            onResolve(earliest, pickedMs)
          }}
        >
          {resolving ? 'Fixing…' : 'Fix overlap'}
        </button>
      </div>
    </div>
  )
}

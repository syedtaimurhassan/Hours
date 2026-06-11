import { useEffect, useMemo, useRef, useState } from 'react'
import { breakMs as breakDurMs } from '../lib/durations'
import { findOverlap } from '../lib/overlapQuery'
import {
  createManualShift,
  saveShiftEdit,
  softDeleteShift,
  type BreakEdit,
} from '../lib/shifts'
import {
  formatDate,
  formatDuration,
  formatTime,
  resolveMs,
  toDateInputValue,
  toTimeInputValue,
} from '../lib/time'
import { getLastJobId } from '../lib/jobs'
import { useSheetBackButton } from '../lib/useSheetBackButton'
import { validateDraft } from '../lib/validate'
import type { Job, Shift } from '../types'
import { BreakEditor, rowToBreakDraft, type BreakRow } from './BreakEditor'
import { DateTimeField, draftToMs, type DateTimeDraft } from './DateTimeField'
import { JobSelector } from './JobBits'

export type EditTarget =
  | { kind: 'edit'; shift: Shift; isActive: boolean }
  | { kind: 'add' }

/**
 * Bottom sheet for manual entry and correction — the forgot-to-end remedy.
 * Native pickers, live duration preview (mistakes and DST surprises visible
 * BEFORE saving), full validation, soft delete with undo via the parent.
 */
export function EditShiftSheet({
  uid,
  target,
  nowMs,
  openShifts,
  jobs,
  onClose,
  onSaved,
  onDeleted,
  onOpenShift,
}: {
  uid: string
  target: EditTarget
  nowMs: number
  openShifts: Shift[]
  jobs: Job[]
  onClose: () => void
  onSaved: (notice: string | null) => void
  onDeleted: (shift: Shift) => void
  onOpenShift: (shiftId: string) => void
}) {
  const editing = target.kind === 'edit' ? target.shift : null
  const isActive = target.kind === 'edit' && target.isActive
  const activeJobsList = jobs.filter((j) => !j.archived)
  const initialJobId = editing
    ? editing.jobId
    : (() => {
        const last = getLastJobId()
        return last && activeJobsList.some((j) => j.id === last) ? last : null
      })()
  const [jobId, setJobId] = useState<string | null>(initialJobId)

  const initial = useMemo(() => {
    if (editing) {
      const startMs = resolveMs(editing.start)
      const endMs =
        editing.end || Object.keys(editing.stopClaims).length > 0
          ? (resolveEditEnd(editing) ?? null)
          : null
      const rows: BreakRow[] = Object.entries(editing.breaks)
        .sort(([, a], [, b]) => resolveMs(a.start) - resolveMs(b.start))
        .map(([id, b]) => ({
          id,
          start: toTimeInputValue(resolveMs(b.start)),
          end: b.end ? toTimeInputValue(resolveMs(b.end)) : '',
        }))
      return {
        start: {
          date: toDateInputValue(startMs),
          time: toTimeInputValue(startMs),
        },
        ongoing: endMs === null,
        end:
          endMs === null
            ? { date: toDateInputValue(startMs), time: '' }
            : { date: toDateInputValue(endMs), time: toTimeInputValue(endMs) },
        rows,
      }
    }
    return {
      start: { date: toDateInputValue(nowMs), time: '' },
      ongoing: false,
      end: { date: toDateInputValue(nowMs), time: '' },
      rows: [] as BreakRow[],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id])

  const [start, setStart] = useState<DateTimeDraft>(initial.start)
  const [ongoing, setOngoing] = useState(initial.ongoing)
  const [end, setEnd] = useState<DateTimeDraft>(initial.end)
  const [rows, setRows] = useState<BreakRow[]>(initial.rows)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [overlapError, setOverlapError] = useState<{
    message: string
    shiftId: string
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Don't show "Enter a date and time" on a pristine Add form — only after the
  // user has touched the field or pressed Save.
  const [touched, setTouched] = useState({ start: false, end: false })
  const [submitted, setSubmitted] = useState(false)
  const endDateTouched = useRef(false)

  useEffect(() => {
    setStart(initial.start)
    setOngoing(initial.ongoing)
    setEnd(initial.end)
    setRows(initial.rows)
    setJobId(initialJobId)
    setOverlapError(null)
    setNotice(null)
    setSaveError(null)
    setTouched({ start: false, end: false })
    setSubmitted(false)
    endDateTouched.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const dirty =
    JSON.stringify({ start, ongoing, end, rows, jobId }) !==
    JSON.stringify({
      start: initial.start,
      ongoing: initial.ongoing,
      end: initial.end,
      rows: initial.rows,
      jobId: initialJobId,
    })

  const requestClose = (viaBack: boolean): boolean => {
    if (dirty && !window.confirm('Discard changes?')) {
      if (viaBack) history.pushState({ sheet: true }, '')
      return false
    }
    onClose()
    return true
  }
  useSheetBackButton(true, () => requestClose(true))

  const startMs = draftToMs(start)
  const endMs = ongoing ? null : draftToMs(end)
  const endBound = ongoing ? nowMs : endMs
  const breakDrafts = rows.map((r) => rowToBreakDraft(r, startMs, endBound))
  const validation = validateDraft(
    {
      startMs,
      end: ongoing ? 'ongoing' : endMs,
      breaks: breakDrafts,
    },
    { nowMs, isActive },
  )

  // Live preview — recomputed exactly like the cards will show it.
  const preview = useMemo(() => {
    if (startMs === null || endBound === null || endBound <= startMs) return null
    const closed = breakDrafts.filter(
      (b): b is BreakEdit & { startMs: number; endMs: number } =>
        b.startMs !== null && b.endMs !== null && b.endMs > b.startMs,
    )
    const fake: Shift = {
      id: 'preview',
      start: { ms: startMs, srv: null },
      end: ongoing ? null : { ms: endBound, srv: null },
      jobId: null,
      stopClaims: {},
      breaks: Object.fromEntries(
        closed.map((b) => [
          b.id,
          {
            start: { ms: b.startMs, srv: null },
            end: { ms: b.endMs, srv: null },
          },
        ]),
      ),
      deleted: false,
      deletedAtMs: null,
      createdAt: null,
      updatedAt: null,
      updatedBy: '',
    }
    const gross = endBound - startMs
    const breaks = breakDurMs(fake, nowMs)
    return `Shift ${formatDuration(gross)} · Breaks ${formatDuration(breaks)} · Worked ${formatDuration(Math.max(0, gross - breaks))}`
  }, [startMs, endBound, ongoing, nowMs, JSON.stringify(breakDrafts)])

  const onStartChange = (v: DateTimeDraft, field: 'date' | 'time') => {
    setStart(v)
    setTouched((t) => ({ ...t, start: true }))
    // The end date auto-follows the start date until the user explicitly
    // touches the end-date field — adding yesterday's shift must not flash a
    // 30 h preview.
    if (field === 'date' && !endDateTouched.current && !ongoing) {
      setEnd((e) => ({ ...e, date: v.date }))
    }
  }

  // "Enter a date and time" shows only after touch/submit; real errors (future,
  // end-before-start) always show because they require a value to exist.
  const showFieldError = (
    field: 'start' | 'end',
    error: string | undefined,
  ): string | undefined => {
    if (!error) return undefined
    if (error === 'Enter a date and time.' && !touched[field] && !submitted) {
      return undefined
    }
    return error
  }

  const applyOvernightFix = () => {
    if (startMs === null) return
    const nextDay = toDateInputValue(startMs + 24 * 3_600_000)
    endDateTouched.current = true
    setEnd((e) => ({ ...e, date: nextDay }))
  }

  const save = async () => {
    setSubmitted(true)
    if (!validation.valid || startMs === null || saving) return
    setSaving(true)
    setOverlapError(null)
    setSaveError(null)
    try {
      const draftInterval = {
        startMs,
        endMs: ongoing ? nowMs : (endMs as number),
      }
      const hit = await findOverlap(
        uid,
        draftInterval,
        editing?.id ?? null,
        openShifts,
        nowMs,
      )
      if (hit) {
        setOverlapError({
          message: `Overlaps shift ${formatTime(hit.startMs)}–${formatTime(hit.endMs)} on ${formatDate(hit.startMs)}`,
          shiftId: hit.shiftId,
        })
        return
      }
      const breaks: BreakEdit[] = breakDrafts
        .filter((b) => b.startMs !== null && b.endMs !== null)
        .map((b) => ({ id: b.id, startMs: b.startMs!, endMs: b.endMs! }))
      // DST echo: if the platform normalized a nonexistent picker time, tell
      // the user what was actually saved.
      const dstNotice =
        toTimeInputValue(startMs) !== start.time
          ? `Adjusted to ${toTimeInputValue(startMs)} (clocks changed that night)`
          : !ongoing && endMs !== null && toTimeInputValue(endMs) !== end.time
            ? `Adjusted to ${toTimeInputValue(endMs)} (clocks changed that night)`
            : null
      if (editing) {
        await saveShiftEdit(uid, editing, {
          startMs,
          end: ongoing ? 'ongoing' : (endMs as number),
          breaks,
          jobId,
        })
      } else {
        await createManualShift(uid, crypto.randomUUID(), {
          startMs,
          endMs: endMs as number,
          breaks,
          jobId,
        })
      }
      onSaved(dstNotice)
      onClose()
    } catch (err) {
      // OpError('shift-deleted') if the doc vanished mid-save, or a failed
      // overlap query — surface it instead of silently re-enabling Save.
      const code = (err as { code?: string })?.code
      setSaveError(
        code === 'shift-deleted'
          ? 'This shift was deleted on another device.'
          : "Couldn't save — please try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  const deleteShift = async () => {
    if (!editing || isActive || deleting) return
    setDeleting(true)
    setSaveError(null)
    try {
      await softDeleteShift(uid, editing.id)
      onDeleted(editing)
      onClose()
    } catch {
      setSaveError("Couldn't delete — please try again.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Sheet onRequestClose={() => requestClose(false)}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {editing ? 'Edit shift' : 'Add shift'}
        </h2>
        <button
          type="button"
          aria-label="Close"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
          onClick={() => requestClose(false)}
        >
          ✕
        </button>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {activeJobsList.length > 0 && (
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Job
            </span>
            <JobSelector
              jobs={activeJobsList}
              selectedId={jobId}
              onSelect={setJobId}
            />
          </div>
        )}

        <DateTimeField
          label="Start"
          value={start}
          onChange={onStartChange}
          error={showFieldError('start', validation.errors.start)}
        />

        {isActive && ongoing ? (
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              End
            </span>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800">
                Ongoing
                {startMs !== null && ` — ${formatDuration(nowMs - startMs)}`}
              </span>
              <button
                type="button"
                className="min-h-11 text-sm font-medium text-emerald-700 underline"
                onClick={() => {
                  setOngoing(false)
                  setEnd({
                    date: toDateInputValue(nowMs),
                    time: toTimeInputValue(nowMs),
                  })
                }}
              >
                End at a specific time…
              </button>
            </div>
          </div>
        ) : (
          <div>
            <DateTimeField
              label="End"
              value={end}
              onChange={(v, field) => {
                if (field === 'date') endDateTouched.current = true
                setTouched((t) => ({ ...t, end: true }))
                setEnd(v)
              }}
              error={showFieldError('end', validation.errors.end)}
            />
            {validation.suggestOvernight && startMs !== null && (
              <button
                type="button"
                className="mt-1 flex min-h-11 items-center text-sm font-medium text-emerald-700 underline"
                onClick={applyOvernightFix}
              >
                Ended the next day? → use{' '}
                {formatDate(startMs + 24 * 3_600_000)}
              </button>
            )}
            {isActive && !ongoing && (
              <button
                type="button"
                className="mt-1 flex min-h-11 items-center text-sm font-medium text-slate-500 underline"
                onClick={() => setOngoing(true)}
              >
                Keep ongoing instead
              </button>
            )}
          </div>
        )}

        <BreakEditor
          rows={rows}
          onChange={setRows}
          errors={validation.errors.breaks}
          windowStartMs={startMs}
          windowEndMs={endBound}
        />

        {validation.errors.form && (
          <p className="text-sm text-red-600">{validation.errors.form}</p>
        )}
        {overlapError && (
          <p className="text-sm text-red-600">
            {overlapError.message}{' '}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => onOpenShift(overlapError.shiftId)}
            >
              Open that shift
            </button>
          </p>
        )}
        {validation.warning && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {validation.warning}
          </p>
        )}
        {notice && <p className="text-sm text-slate-500">{notice}</p>}
        {saveError && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {saveError}
          </p>
        )}
        {preview && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
            {preview}
          </p>
        )}

        <button
          type="submit"
          disabled={!validation.valid || saving || (!dirty && !!editing)}
          className="min-h-12 rounded-xl bg-emerald-600 text-base font-semibold text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        {editing && (
          <div className="mt-2 border-t border-slate-200 pt-3 text-center">
            {isActive ? (
              <p className="text-sm text-slate-500">
                To delete this shift, end it first.
              </p>
            ) : (
              <button
                type="button"
                disabled={deleting}
                className="min-h-11 text-sm font-medium text-red-600 disabled:opacity-50"
                onClick={() => void deleteShift()}
              >
                {deleting ? 'Deleting…' : 'Delete shift'}
              </button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  )
}

/** Resolve the end for editing: committed end or earliest stop claim. */
function resolveEditEnd(shift: Shift): number | null {
  if (shift.end && shift.end.srv === null) return shift.end.ms
  const candidates: number[] = []
  if (shift.end) candidates.push(resolveMs(shift.end))
  for (const c of Object.values(shift.stopClaims)) candidates.push(resolveMs(c))
  return candidates.length ? Math.min(...candidates) : null
}

export function Sheet({
  children,
  onRequestClose,
}: {
  children: React.ReactNode
  onRequestClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onRequestClose}
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet-enter safe-bottom relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[20px] bg-grouped px-4 pt-2.5 pb-6 shadow-[0_-8px_40px_-8px_rgb(0_0_0/0.3)]"
      >
        <div className="mx-auto mb-3 h-1.5 w-9 rounded-full bg-[#0000001f]" />
        {children}
      </div>
    </div>
  )
}

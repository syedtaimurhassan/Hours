import { useEffect, useMemo, useRef, useState } from 'react'
import { BigButton, type BigButtonState } from '../components/BigButton'
import { LongShiftSheet } from '../components/LongShiftSheet'
import { ShiftCard, type ShiftBadge } from '../components/ShiftCard'
import type { Snack } from '../components/Snackbar'
import {
  effectiveEndMs,
  openBreakId,
  periodTotals,
  workedMs,
} from '../lib/durations'
import {
  adjustStart,
  discardActiveShift,
  endShift,
  pauseShift,
  restoreStart,
  resumeShift,
  saveShiftEdit,
  startShift,
  undoDelete,
  undoEnd,
  OpError,
} from '../lib/shifts'
import {
  dayKey,
  dayRange,
  formatDuration,
  formatTime,
  resolveMs,
} from '../lib/time'
import { getLastJobId, setLastJobId } from '../lib/jobs'
import { JobSelector } from '../components/JobBits'
import { useNow } from '../lib/useNow'
import { usePeriodShifts, type SnapMeta } from '../lib/useShifts'
import type { ReconcileResult } from '../lib/reconcile'
import type { EditRequest, Job, Shift } from '../types'

type Pending = 'starting' | 'ending' | 'pausing' | 'resuming' | null

/** The Track screen: one big button, today's shifts, recovery flows. */
export function Main({
  uid,
  openShifts,
  openMeta,
  flags,
  jobs,
  jobsById,
  forgotThresholdMs,
  onEdit,
  onManageJobs,
  showSnack,
}: {
  uid: string
  openShifts: Shift[]
  openMeta: SnapMeta
  flags: ReconcileResult
  jobs: Job[]
  jobsById: Map<string, Job>
  /** Forgot-to-end intercept threshold (ms); 0 = disabled in settings. */
  forgotThresholdMs: number
  onEdit: (target: EditRequest) => void
  onManageJobs: () => void
  showSnack: (snack: Omit<Snack, 'key'>) => void
}) {
  const now = useNow(true)
  const active = openShifts[0] ?? null
  const activeBreakId = active ? openBreakId(active) : null
  const knownOffline = openMeta.fromCache

  // Job selected for the NEXT shift — defaults to last-used active job.
  const [selectedJobId, setSelectedJobId] = useState<string | null>(() => {
    const last = getLastJobId()
    return last && jobs.some((j) => j.id === last && !j.archived) ? last : null
  })
  // Keep selection valid as jobs load/change; default to the first job.
  useEffect(() => {
    if (selectedJobId && !jobs.some((j) => j.id === selectedJobId && !j.archived)) {
      setSelectedJobId(null)
    } else if (selectedJobId === null && getLastJobId() === null) {
      const first = jobs.find((j) => !j.archived)
      if (first) setSelectedJobId(first.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs])
  const activeJobsList = jobs.filter((j) => !j.archived)
  const trackedJob = active
    ? (active.jobId ? jobsById.get(active.jobId) : undefined)
    : (selectedJobId ? jobsById.get(selectedJobId) : undefined)

  const todayKey = dayKey(now)
  const range = useMemo(
    () => dayRange(Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayKey],
  )
  const { shifts: todayShifts, meta: todayMeta } = usePeriodShifts(
    uid,
    range.start,
    range.end,
  )

  const [pending, setPending] = useState<Pending>(null)
  const [recovery, setRecovery] = useState(false)

  // Pending exits when the snapshot confirms the expected state…
  useEffect(() => {
    if (!pending) return
    const confirmed =
      (pending === 'starting' && active !== null) ||
      (pending === 'ending' && active === null) ||
      (pending === 'pausing' && activeBreakId !== null) ||
      (pending === 'resuming' && active !== null && activeBreakId === null)
    if (confirmed) setPending(null)
  }, [pending, active, activeBreakId])
  // …and a watchdog re-derives from the snapshot — it never reverts a tap
  // into nothing (the tap exists as at least a queued local write).
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => setPending(null), 10_000)
    return () => clearTimeout(t)
  }, [pending])

  // 1.5 s settling window after any state change.
  const [settling, setSettling] = useState(false)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setSettling(true)
    const t = setTimeout(() => setSettling(false), 1500)
    return () => clearTimeout(t)
  }, [active?.id, activeBreakId])

  const opFailed = (err: unknown) => {
    setPending(null)
    if (err instanceof OpError) {
      const messages = {
        'already-running': 'Shift already started on another device.',
        'already-ended': 'Shift was already ended on another device.',
        'shift-deleted': 'This shift was deleted on another device.',
        'undo-lock-taken': "Couldn't undo — another shift is already running.",
      } as const
      showSnack({ message: messages[err.code] })
    } else {
      showSnack({ message: 'Something went wrong — please try again.' })
    }
  }

  const doStart = () => {
    const tapMs = Date.now()
    const shiftId = crypto.randomUUID()
    markHasStarted()
    setLastJobId(selectedJobId)
    setPending('starting')
    startShift({ uid, tapMs, shiftId, jobId: selectedJobId, knownOffline })
      .then(() =>
        showSnack({
          message: `Shift started at ${formatTime(tapMs)}`,
          actions: [
            {
              label: 'UNDO',
              run: () => void discardActiveShift(uid, shiftId, knownOffline),
            },
          ],
        }),
      )
      .catch(opFailed)
  }

  const doEnd = (shift: Shift) => {
    const tapMs = Date.now()
    setPending('ending')
    endShift({ uid, tapMs, shift, knownOffline })
      .then(({ closedBreakId }) =>
        showSnack({
          message: `Shift ended at ${formatTime(tapMs)}${closedBreakId ? ', break closed' : ''}`,
          actions: [
            {
              label: 'UNDO',
              run: () =>
                void undoEnd(uid, shift.id, closedBreakId, knownOffline).catch(
                  opFailed,
                ),
            },
            {
              label: 'Fix times',
              run: () => onEdit({ kind: 'edit', shiftId: shift.id }),
            },
          ],
        }),
      )
      .catch(opFailed)
  }

  const onBigTap = () => {
    if (pending) return
    if (!active) {
      doStart()
      return
    }
    // Forgot-to-end interception: one threshold — banner and behavior agree
    // (0 = disabled in settings).
    if (forgotThresholdMs > 0 && now - resolveMs(active.start) > forgotThresholdMs) {
      setRecovery(true)
      return
    }
    doEnd(active)
  }

  const onPauseResume = () => {
    if (!active || pending) return
    if (settling) {
      // Same debounce treatment as the big button — swallow with a nod.
      showSnack({ message: 'One moment…', ttl: 2000 })
      return
    }
    const tapMs = Date.now()
    if (activeBreakId) {
      setPending('resuming')
      resumeShift({ uid, tapMs, shift: active, knownOffline }).catch(opFailed)
    } else {
      setPending('pausing')
      pauseShift({ uid, tapMs, shift: active, knownOffline }).catch(opFailed)
    }
  }

  const quickAdjust = (minutes: number) => {
    if (!active) return
    adjustStart(uid, active, -minutes * 60_000)
      .then(({ previousStartMs }) =>
        showSnack({
          message: `Start moved to ${formatTime(previousStartMs - minutes * 60_000)}`,
          actions: [
            {
              label: 'UNDO',
              run: () =>
                void restoreStart(uid, active.id, previousStartMs).catch(
                  opFailed,
                ),
            },
          ],
        }),
      )
      .catch(opFailed)
  }

  const pendingLabels = {
    starting: 'Starting…',
    ending: 'Ending…',
    pausing: 'Pausing…',
    resuming: 'Resuming…',
  } as const
  const buttonState: BigButtonState = pending
    ? { kind: 'pending', label: pendingLabels[pending] }
    : active
      ? {
          kind: 'running',
          elapsedMs: workedMs(active, now),
          startMs: resolveMs(active.start),
          startedYesterday: dayKey(resolveMs(active.start)) !== todayKey,
          onBreak: activeBreakId
            ? {
                sinceMs: resolveMs(active.breaks[activeBreakId].start),
              }
            : null,
        }
      : {
          kind: 'idle',
          // Only the genuine first run, not every empty morning.
          firstRun:
            todayMeta.serverSeen && todayShifts.length === 0 && !hasEverStarted(),
        }

  // The active shift is ALWAYS shown in Today regardless of start day — a
  // night-shift worker at 00:30 must never see a running timer above
  // "No shifts today." Dashboard attribution is unchanged.
  const todayList = useMemo(() => {
    const list = [...todayShifts]
    if (active && !list.some((s) => s.id === active.id)) list.unshift(active)
    return list.sort((a, b) => resolveMs(b.start) - resolveMs(a.start))
  }, [todayShifts, active])
  const todayTotals = periodTotals(todayShifts, now)
  // The header total counts shifts attributed to today (by start day). When an
  // overnight shift started yesterday is shown here too, note the exclusion so
  // the header can't appear to contradict the cards below it.
  const overnightShown =
    active !== null && dayKey(resolveMs(active.start)) !== todayKey

  const badgesFor = (s: Shift): ShiftBadge[] => {
    const badges: ShiftBadge[] = []
    if (s.pendingWrite) badges.push('syncing')
    if (flags.badTimesIds.includes(s.id)) badges.push('badTimes')
    if (flags.overlapIds.includes(s.id)) badges.push('overlap')
    return badges
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-28">
      {/* Job selector for the next shift — only when idle and jobs exist. */}
      {!active && !pending && activeJobsList.length > 0 && (
        <div className="mb-6">
          <JobSelector
            jobs={activeJobsList}
            selectedId={selectedJobId}
            onSelect={setSelectedJobId}
            onManage={onManageJobs}
          />
        </div>
      )}

      <BigButton
        state={buttonState}
        settling={settling}
        nowMs={now}
        job={trackedJob}
        onTap={onBigTap}
        onSwallowedTap={() =>
          showSnack({
            message: active ? 'Just started — UNDO is below' : 'Just ended — UNDO is below',
            ttl: 3000,
          })
        }
      />

      {active && !pending && (
        <>
          {/* ≥32px dead zone between the circle and the pill — a clipped
              thumb going for Pause must not end the shift. */}
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              className={`min-h-12 rounded-full px-8 text-base font-semibold ${
                activeBreakId
                  ? 'bg-emerald-600 text-white active:bg-emerald-700'
                  : 'border-2 border-amber-400 bg-white text-amber-700 active:bg-amber-50'
              } ${settling ? 'settling' : ''}`}
              onClick={onPauseResume}
            >
              {activeBreakId ? 'Resume' : 'Pause'}
            </button>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <span className="text-slate-500">Started earlier?</span>
            {[5, 15, 30].map((m) => (
              <button
                key={m}
                type="button"
                className="min-h-11 rounded-full border border-slate-300 bg-white px-3 font-medium text-slate-700 active:bg-slate-100"
                onClick={() => quickAdjust(m)}
              >
                −{m} min
              </button>
            ))}
          </div>
        </>
      )}

      {!active && !pending && activeJobsList.length === 0 && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onManageJobs}
            className="min-h-9 text-sm font-medium text-emerald-700 underline"
          >
            Set up jobs to track workplaces separately
          </button>
        </div>
      )}

      <section className="mt-10">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Today
          </h2>
          {todayShifts.length > 0 && (
            <span className="text-sm font-medium text-slate-700">
              Worked {formatDuration(todayTotals.workedMs)}
              {overnightShown && (
                <span className="ml-1 font-normal text-slate-500">
                  · excl. overnight
                </span>
              )}
            </span>
          )}
        </div>
        {!todayMeta.serverSeen && todayList.length === 0 ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
            <p className="text-center text-sm text-slate-500">
              Loading your shifts…
            </p>
          </div>
        ) : todayList.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No shifts today.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {todayList.map((s) => {
              const end = effectiveEndMs(s)
              const startedBeforeToday =
                end === null && dayKey(resolveMs(s.start)) !== todayKey
              return (
                <ShiftCard
                  key={s.id}
                  shift={s}
                  job={s.jobId ? jobsById.get(s.jobId) : undefined}
                  nowMs={now}
                  endMs={end}
                  badges={badgesFor(s)}
                  {...(startedBeforeToday
                    ? {
                        startedYesterdayLabel: `started yesterday ${formatTime(resolveMs(s.start))}`,
                      }
                    : {})}
                  onTap={() => onEdit({ kind: 'edit', shiftId: s.id })}
                />
              )
            })}
          </div>
        )}
      </section>

      {recovery && active && (
        <LongShiftSheet
          shift={active}
          nowMs={now}
          startingNew={false}
          onEndNow={() => {
            setRecovery(false)
            doEnd(active)
          }}
          onPickEnd={(endMs) => {
            setRecovery(false)
            void saveShiftEdit(uid, active, {
              startMs: resolveMs(active.start),
              end: endMs,
              breaks: closedBreaksUpTo(active, endMs),
            }).then(() =>
              showSnack({
                message: `Shift ended at ${formatTime(endMs)}`,
                actions: [
                  {
                    label: 'Fix times',
                    run: () => onEdit({ kind: 'edit', shiftId: active.id }),
                  },
                ],
              }),
            )
          }}
          onDiscard={() => {
            setRecovery(false)
            void discardActiveShift(uid, active.id, knownOffline).then(() =>
              showSnack({
                message: 'Shift discarded',
                actions: [
                  {
                    label: 'UNDO',
                    run: () => void undoDelete(uid, active.id),
                  },
                ],
              }),
            )
          }}
          onClose={() => setRecovery(false)}
        />
      )}
    </div>
  )
}

/** Keep only breaks that are closed (or close them) within the picked end. */
function closedBreaksUpTo(shift: Shift, endMs: number) {
  return Object.entries(shift.breaks)
    .map(([id, b]) => ({
      id,
      startMs: resolveMs(b.start),
      endMs: b.end ? Math.min(resolveMs(b.end), endMs) : endMs,
    }))
    .filter((b) => b.startMs < endMs && b.endMs > b.startMs)
}

// Per-device "has the user ever started a shift" flag — gates the first-run
// hint so it shows once, not on every empty day.
const STARTED_KEY = 'hours.hasStarted'
function hasEverStarted(): boolean {
  try {
    return localStorage.getItem(STARTED_KEY) === '1'
  } catch {
    return false
  }
}
function markHasStarted(): void {
  try {
    localStorage.setItem(STARTED_KEY, '1')
  } catch {
    /* private browsing */
  }
}

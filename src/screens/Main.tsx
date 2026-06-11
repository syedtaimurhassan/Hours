import { useEffect, useMemo, useRef, useState } from 'react'
import { BigButton, type BigButtonState } from '../components/BigButton'
import { JobSelector } from '../components/JobBits'
import { LiveTotal } from '../components/Live'
import { LongShiftSheet } from '../components/LongShiftSheet'
import { ShiftCard, type ShiftBadge } from '../components/ShiftCard'
import type { Snack } from '../components/Snackbar'
import { SwipeRow } from '../components/SwipeRow'
import { GroupHeader, ListGroup } from '../components/ui'
import { effectiveEndMs, openBreakId } from '../lib/durations'
import { getLastJobId, setLastJobId } from '../lib/jobs'
import {
  discardActiveShift,
  endShift,
  pauseShift,
  resumeShift,
  saveShiftEdit,
  startShift,
  undoDelete,
  OpError,
} from '../lib/shifts'
import { TZ, dayKey, dayRange, formatTime, resolveMs } from '../lib/time'
import { useNow } from '../lib/useNow'
import { usePeriodShifts, type SnapMeta } from '../lib/useShifts'
import type { ReconcileResult } from '../lib/reconcile'
import type { EditRequest, Job, Shift } from '../types'

type Pending = 'starting' | 'ending' | 'pausing' | 'resuming' | null

const longDateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** Track — a dashboard: the timer hero plus a Today widget. */
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
  onDeleteShift,
  showSnack,
}: {
  uid: string
  openShifts: Shift[]
  openMeta: SnapMeta
  flags: ReconcileResult
  jobs: Job[]
  jobsById: Map<string, Job>
  forgotThresholdMs: number
  onEdit: (target: EditRequest) => void
  onManageJobs: () => void
  onDeleteShift: (shiftId: string) => void
  showSnack: (snack: Omit<Snack, 'key'>) => void
}) {
  // Layout clock — updates on data/visibility, NOT every second. Per-second
  // ticking lives inside the LiveTimer / LiveTotal leaves only.
  const now = useNow(false)
  const active = openShifts[0] ?? null
  const activeBreakId = active ? openBreakId(active) : null
  const knownOffline = openMeta.fromCache

  const [selectedJobId, setSelectedJobId] = useState<string | null>(() => {
    const last = getLastJobId()
    return last && jobs.some((j) => j.id === last && !j.archived) ? last : null
  })
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
    ? active.jobId
      ? jobsById.get(active.jobId)
      : undefined
    : selectedJobId
      ? jobsById.get(selectedJobId)
      : undefined

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

  useEffect(() => {
    if (!pending) return
    const confirmed =
      (pending === 'starting' && active !== null) ||
      (pending === 'ending' && active === null) ||
      (pending === 'pausing' && activeBreakId !== null) ||
      (pending === 'resuming' && active !== null && activeBreakId === null)
    if (confirmed) setPending(null)
  }, [pending, active, activeBreakId])
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => setPending(null), 10_000)
    return () => clearTimeout(t)
  }, [pending])

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
    setLastJobId(selectedJobId)
    setPending('starting')
    startShift({ uid, tapMs, shiftId, jobId: selectedJobId, knownOffline })
      .then(() => showSnack({ message: `Started at ${formatTime(tapMs)}` }))
      .catch(opFailed)
  }

  const doEnd = (shift: Shift) => {
    const tapMs = Date.now()
    setPending('ending')
    endShift({ uid, tapMs, shift, knownOffline })
      .then(({ closedBreakId }) =>
        showSnack({
          message: `Ended at ${formatTime(tapMs)}${closedBreakId ? ', break closed' : ''}`,
          actions: [{ label: 'Edit', run: () => onEdit({ kind: 'edit', shiftId: shift.id }) }],
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
    if (forgotThresholdMs > 0 && now - resolveMs(active.start) > forgotThresholdMs) {
      setRecovery(true)
      return
    }
    doEnd(active)
  }

  const onPauseResume = () => {
    if (!active || pending) return
    if (settling) {
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
          shift: active,
          startMs: resolveMs(active.start),
          startedYesterday: dayKey(resolveMs(active.start)) !== todayKey,
          onBreak: activeBreakId
            ? { sinceMs: resolveMs(active.breaks[activeBreakId].start) }
            : null,
        }
      : { kind: 'idle' }

  const todayList = useMemo(() => {
    const list = [...todayShifts]
    if (active && !list.some((s) => s.id === active.id)) list.unshift(active)
    return list.sort((a, b) => resolveMs(b.start) - resolveMs(a.start))
  }, [todayShifts, active])
  // The today total covers shifts attributed to today; it ticks only if one of
  // those is running (an overnight shift counts toward yesterday, so it doesn't).
  const todayHasRunning = todayShifts.some((s) => effectiveEndMs(s) === null)
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
    <div className="mx-auto max-w-md px-4 pt-1 pb-28">
      <p className="mb-6 text-[15px] font-semibold text-secondary">
        {longDateFmt.format(now)}
      </p>

      {/* Job selector for the next shift — only when idle and jobs exist. */}
      {!active && !pending && activeJobsList.length > 0 && (
        <div className="mb-7">
          <JobSelector
            jobs={activeJobsList}
            selectedId={selectedJobId}
            onSelect={setSelectedJobId}
            onManage={onManageJobs}
            allowNone={false}
          />
        </div>
      )}

      <div className={!active && !pending && activeJobsList.length > 0 ? '' : 'mt-4'}>
        <BigButton
          state={buttonState}
          settling={settling}
          job={trackedJob}
          onTap={onBigTap}
          onSwallowedTap={() =>
            showSnack({
              message: active ? 'Just started' : 'Just ended',
              ttl: 2500,
            })
          }
        />
      </div>

      {active && !pending && (
        <div className="mt-9 flex justify-center">
          <button
            type="button"
            onClick={onPauseResume}
            className={`min-h-12 rounded-full px-9 text-[17px] font-semibold transition active:scale-95 ${
              activeBreakId
                ? 'bg-brand text-white'
                : 'card-shadow bg-card text-amber-600'
            } ${settling ? 'settling' : ''}`}
          >
            {activeBreakId ? 'Resume' : 'Take a break'}
          </button>
        </div>
      )}

      {/* Today widget */}
      <section className="mt-12">
        <div className="mb-2 flex items-baseline justify-between">
          <GroupHeader>Today</GroupHeader>
          {todayShifts.length > 0 && (
            <span className="mr-1 text-[13px] font-semibold text-secondary">
              <LiveTotal shifts={todayShifts} live={todayHasRunning} />
              {overnightShown && (
                <span className="ml-1 font-normal text-tertiary">· excl. overnight</span>
              )}
            </span>
          )}
        </div>

        {!todayMeta.serverSeen && todayList.length === 0 ? (
          <ListGroup>
            <div className="h-14 animate-pulse" />
          </ListGroup>
        ) : todayList.length === 0 ? (
          <div className="card-shadow rounded-2xl bg-card px-4 py-8 text-center text-[15px] text-tertiary">
            No shifts yet today.
          </div>
        ) : (
          <ListGroup>
            {todayList.map((s) => {
              const end = effectiveEndMs(s)
              const startedBeforeToday =
                end === null && dayKey(resolveMs(s.start)) !== todayKey
              return (
                <SwipeRow
                  key={s.id}
                  disabled={end === null}
                  onDelete={() => onDeleteShift(s.id)}
                >
                  <ShiftCard
                    shift={s}
                    job={s.jobId ? jobsById.get(s.jobId) : undefined}
                    endMs={end}
                    badges={badgesFor(s)}
                    {...(startedBeforeToday
                      ? { startedYesterdayLabel: `since yesterday ${formatTime(resolveMs(s.start))}` }
                      : {})}
                    onTap={() => onEdit({ kind: 'edit', shiftId: s.id })}
                  />
                </SwipeRow>
              )
            })}
          </ListGroup>
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
                message: `Ended at ${formatTime(endMs)}`,
                actions: [
                  { label: 'Edit', run: () => onEdit({ kind: 'edit', shiftId: active.id }) },
                ],
              }),
            )
          }}
          onDiscard={() => {
            setRecovery(false)
            void discardActiveShift(uid, active.id, knownOffline).then(() =>
              showSnack({
                message: 'Shift discarded',
                actions: [{ label: 'Undo', run: () => void undoDelete(uid, active.id) }],
              }),
            )
          }}
          onClose={() => setRecovery(false)}
        />
      )}
    </div>
  )
}

/** Keep only breaks closed within the picked end. */
function closedBreaksUpTo(shift: Shift, endMs: number) {
  return Object.entries(shift.breaks)
    .map(([id, b]) => ({
      id,
      startMs: resolveMs(b.start),
      endMs: b.end ? Math.min(resolveMs(b.end), endMs) : endMs,
    }))
    .filter((b) => b.startMs < endMs && b.endMs > b.startMs)
}

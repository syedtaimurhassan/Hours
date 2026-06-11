import { useMemo, useRef, useState } from 'react'
import { BarChart } from '../components/BarChart'
import { JobSelector } from '../components/JobBits'
import { LiveTotal } from '../components/Live'
import { ShiftCard, type ShiftBadge } from '../components/ShiftCard'
import { GroupHeader, ListGroup, Segmented } from '../components/ui'
import { buildBuckets } from '../lib/chart'
import { effectiveEndMs, periodTotals } from '../lib/durations'
import { downloadCsv, shiftsToCsv } from '../lib/export'
import {
  customRange,
  dayKey,
  dayRange,
  formatDate,
  formatDayHeader,
  formatDuration,
  isoWeekNumber,
  monthRange,
  parseDateInput,
  resolveMs,
  toDateInputValue,
  wallToEpoch,
  weekRange,
  type PeriodRange,
} from '../lib/time'
import { useNow } from '../lib/useNow'
import { useReconcile } from '../lib/useReconcile'
import { usePeriodShifts } from '../lib/useShifts'
import type { EditRequest, Job, PeriodFilter, Shift } from '../types'

const PAGE_SIZE = 50
const FILTER_KEY = 'hours.lastFilter'

const monthFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Copenhagen',
  month: 'long',
  year: 'numeric',
})

function loadLastFilter(): PeriodFilter {
  try {
    const f = localStorage.getItem(FILTER_KEY)
    if (f === 'day' || f === 'week' || f === 'month' || f === 'custom') return f
  } catch {
    /* private browsing */
  }
  return 'week'
}

/** History / dashboard: filters, period totals, chart, shifts grouped by day. */
export function History({
  uid,
  candidates,
  observedActiveId,
  jobs,
  jobsById,
  onEdit,
}: {
  uid: string
  /** Global open-query docs — merged into reconcile detection. */
  candidates: Shift[]
  observedActiveId: string | null | undefined
  jobs: Job[]
  jobsById: Map<string, Job>
  onEdit: (target: EditRequest) => void
}) {
  // Layout clock — ticking is delegated to the LiveTotal/ShiftCard leaves.
  const now = useNow(false)
  const [filter, setFilterRaw] = useState<PeriodFilter>(loadLastFilter)
  const [anchorMs, setAnchorMs] = useState(() => Date.now())
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(Date.now()))
  const [customTo, setCustomTo] = useState(() => toDateInputValue(Date.now()))
  const [limit, setLimit] = useState(PAGE_SIZE)
  // null = all jobs; otherwise filter the dashboard to one job.
  const [jobFilter, setJobFilter] = useState<string | null>(null)
  const lastGoodCustom = useRef<PeriodRange | null>(null)
  const activeJobsList = useMemo(() => jobs.filter((j) => !j.archived), [jobs])

  const setFilter = (f: PeriodFilter) => {
    setFilterRaw(f)
    setLimit(PAGE_SIZE)
    try {
      localStorage.setItem(FILTER_KEY, f)
    } catch {
      /* private browsing */
    }
  }

  const customError = useMemo(() => {
    if (filter !== 'custom') return null
    const from = parseDateInput(customFrom)
    const to = parseDateInput(customTo)
    if (!from || !to) return 'Pick both dates.'
    const fromMs = wallToEpoch(from.y, from.m, from.d, 0, 0)
    const toMs = wallToEpoch(to.y, to.m, to.d, 0, 0)
    if (toMs < fromMs) return 'End date is before start date'
    return null
  }, [filter, customFrom, customTo])

  const range: PeriodRange = useMemo(() => {
    if (filter === 'custom') {
      const from = parseDateInput(customFrom)
      const to = parseDateInput(customTo)
      if (from && to && !customError) {
        const r = customRange(
          wallToEpoch(from.y, from.m, from.d, 0, 0),
          wallToEpoch(to.y, to.m, to.d, 0, 0),
        )
        lastGoodCustom.current = r
        return r
      }
      // Inverted/incomplete range: keep previous results.
      return lastGoodCustom.current ?? dayRange(anchorMs)
    }
    if (filter === 'day') return dayRange(anchorMs)
    if (filter === 'month') return monthRange(anchorMs)
    return weekRange(anchorMs)
  }, [filter, anchorMs, customFrom, customTo, customError])

  const { shifts: allShifts, meta } = usePeriodShifts(uid, range.start, range.end)

  // Reconcile over everything (job filter is a view concern, not data).
  const merged = useMemo(() => {
    const byId = new Map(allShifts.map((s) => [s.id, s]))
    for (const c of candidates) if (!byId.has(c.id)) byId.set(c.id, c)
    return [...byId.values()]
  }, [allShifts, candidates])
  const flags = useReconcile(uid, merged, observedActiveId)

  // Apply the job filter to the displayed/totaled/charted set.
  const shifts = useMemo(
    () => (jobFilter === null ? allShifts : allShifts.filter((s) => s.jobId === jobFilter)),
    [allShifts, jobFilter],
  )

  const isCurrent = now >= range.start && now < range.end
  const totals = periodTotals(shifts, now)
  const periodHasRunning = shifts.some((s) => effectiveEndMs(s) === null)
  const buckets = useMemo(
    () => buildBuckets(shifts, range.start, range.end, now),
    [shifts, range.start, range.end, now],
  )

  const exportCsv = () => {
    const csv = shiftsToCsv(
      shifts,
      (jobId) => (jobId ? (jobsById.get(jobId)?.name ?? 'Unknown job') : 'No job'),
      now,
    )
    downloadCsv(`hours_${dayKey(range.start)}_${dayKey(range.end - 1)}.csv`, csv)
  }

  const header = useMemo(() => {
    const lastDayMs = range.end - 1
    if (filter === 'day') {
      const today = dayKey(now)
      const k = dayKey(range.start)
      const title =
        k === today
          ? 'Today'
          : k === dayKey(dayRange(now).start - 1)
            ? 'Yesterday'
            : formatDayHeader(range.start)
      return { title, sub: formatDate(range.start) }
    }
    if (filter === 'week') {
      const thisWeek = weekRange(now)
      const title =
        range.start === thisWeek.start
          ? 'This week'
          : range.end === thisWeek.start
            ? 'Last week'
            : `Week ${isoWeekNumber(range.start)}`
      return {
        title,
        sub: `Week ${isoWeekNumber(range.start)} · ${formatDate(range.start)} – ${formatDate(lastDayMs)}`,
      }
    }
    if (filter === 'month') {
      const thisMonth = monthRange(now)
      const title =
        range.start === thisMonth.start
          ? 'This month'
          : range.end === thisMonth.start
            ? 'Last month'
            : monthFmt.format(range.start)
      return {
        title,
        sub: `${formatDate(range.start)} – ${formatDate(lastDayMs)}`,
      }
    }
    return {
      title: 'Custom range',
      sub: `${formatDate(range.start)} – ${formatDate(lastDayMs)}`,
    }
  }, [filter, range.start, range.end, now])

  // Group by canonical start day, newest first.
  const groups = useMemo(() => {
    const byDay = new Map<string, Shift[]>()
    const sorted = [...shifts].sort(
      (a, b) => resolveMs(b.start) - resolveMs(a.start),
    )
    for (const s of sorted) {
      const k = dayKey(resolveMs(s.start))
      const list = byDay.get(k)
      if (list) list.push(s)
      else byDay.set(k, [s])
    }
    return [...byDay.entries()]
  }, [shifts])

  let shown = 0
  // Each visible group carries BOTH the page slice (to render) and its full
  // day list (for the day-header total) — so a day split across the 50-item
  // page boundary still shows the correct "Worked" total.
  const visibleGroups: { key: string; take: Shift[]; full: Shift[] }[] = []
  for (const [k, list] of groups) {
    if (shown >= limit) break
    const take = list.slice(0, Math.max(0, limit - shown))
    visibleGroups.push({ key: k, take, full: list })
    shown += take.length
  }
  const hasMore = shifts.length > shown

  const badgesFor = (s: Shift): ShiftBadge[] => {
    const badges: ShiftBadge[] = []
    if (s.pendingWrite) badges.push('syncing')
    if (flags.badTimesIds.includes(s.id)) badges.push('badTimes')
    if (flags.overlapIds.includes(s.id)) badges.push('overlap')
    return badges
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-3 pb-28">
      {/* Period segmented control + add */}
      <div className="flex items-center justify-between gap-2">
        <Segmented
          value={filter}
          onChange={(f) => setFilter(f)}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        <button
          type="button"
          aria-label="Add shift"
          className="card-shadow flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-card text-[22px] leading-none font-light text-brand-deep active:bg-fill"
          onClick={() => onEdit({ kind: 'add' })}
        >
          +
        </button>
      </div>

      {filter === 'custom' ? (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="From date"
              className="min-h-11 flex-1 rounded-xl border border-separator bg-card px-3 text-[15px]"
              value={customFrom}
              max={toDateInputValue(now)}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span className="text-tertiary">–</span>
            <input
              type="date"
              aria-label="To date"
              className="min-h-11 flex-1 rounded-xl border border-separator bg-card px-3 text-[15px]"
              value={customTo}
              min={customFrom}
              max={toDateInputValue(now)}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
          {customError && <p className="mt-1 text-[13px] text-red-600">{customError}</p>}
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous period"
            className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-2xl text-secondary active:bg-fill"
            onClick={() => {
              setAnchorMs(range.start - 1)
              setLimit(PAGE_SIZE)
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="min-w-0 text-center"
            onClick={() => {
              setAnchorMs(Date.now())
              setLimit(PAGE_SIZE)
            }}
          >
            <span className="block text-[17px] font-semibold text-label">
              {header.title}
            </span>
            <span className="block text-[12px] text-secondary">{header.sub}</span>
          </button>
          <button
            type="button"
            aria-label="Next period"
            disabled={range.end > now}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-2xl text-secondary active:bg-fill disabled:opacity-25"
            onClick={() => {
              setAnchorMs(range.end)
              setLimit(PAGE_SIZE)
            }}
          >
            ›
          </button>
        </div>
      )}

      {!isCurrent && filter !== 'custom' && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            className="min-h-8 rounded-full bg-fill px-3 text-[13px] font-medium text-brand-deep"
            onClick={() => {
              setAnchorMs(Date.now())
              setLimit(PAGE_SIZE)
            }}
          >
            Jump to today
          </button>
        </div>
      )}

      {/* Per-job filter */}
      {activeJobsList.length > 0 && (
        <div className="mt-4">
          <JobSelector
            jobs={activeJobsList}
            selectedId={jobFilter}
            onSelect={setJobFilter}
            allowNone={false}
          />
        </div>
      )}

      {/* Summary widget */}
      <div className="mt-4 card-shadow rounded-2xl bg-card px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-secondary">Worked</p>
            <p className="text-[32px] leading-none font-bold tracking-tight text-label">
              <LiveTotal shifts={shifts} live={periodHasRunning} />
            </p>
          </div>
          {meta.fromCache ? (
            <span className="inline-block h-3 w-12 animate-pulse rounded bg-fill" />
          ) : (
            shifts.length > 0 && (
              <button
                type="button"
                onClick={exportCsv}
                className="flex min-h-9 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-semibold text-secondary active:opacity-70"
              >
                <DownloadIcon /> Export
              </button>
            )
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-secondary">
          {formatDuration(totals.shiftMs)} shift · {formatDuration(totals.breakMs)} break
          {jobFilter !== null && <> · {jobsById.get(jobFilter)?.name ?? 'job'}</>}
        </p>
      </div>

      {/* Chart widget */}
      {buckets.length > 0 && shifts.length > 0 && (
        <div className="mt-3">
          <BarChart buckets={buckets} />
        </div>
      )}

      {/* Shift list */}
      {!meta.serverSeen && shifts.length === 0 ? (
        <div className="mt-4">
          <div className="card-shadow h-28 animate-pulse rounded-2xl bg-card" />
        </div>
      ) : shifts.length === 0 ? (
        <div className="mt-4 card-shadow rounded-2xl bg-card px-4 py-10 text-center text-[15px] text-tertiary">
          No shifts in this period.
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          {visibleGroups.map(({ key: k, take, full }) => {
            const dayTotals = periodTotals(full, now)
            return (
              <section key={k}>
                <div className="mb-2 flex items-baseline justify-between">
                  <GroupHeader>{formatDayHeader(resolveMs(full[0].start))}</GroupHeader>
                  <span className="mr-1 text-[13px] font-semibold text-secondary">
                    {formatDuration(dayTotals.workedMs)}
                  </span>
                </div>
                <ListGroup>
                  {take.map((s) => (
                    <ShiftCard
                      key={s.id}
                      shift={s}
                      job={s.jobId ? jobsById.get(s.jobId) : undefined}
                      endMs={effectiveEndMs(s)}
                      badges={badgesFor(s)}
                      onTap={() => onEdit({ kind: 'edit', shiftId: s.id })}
                    />
                  ))}
                </ListGroup>
              </section>
            )
          })}
          {hasMore && (
            <button
              type="button"
              className="card-shadow min-h-12 rounded-2xl bg-card text-[15px] font-medium text-brand-deep"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
    </svg>
  )
}

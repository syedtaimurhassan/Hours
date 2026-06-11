import { useMemo, useRef, useState } from 'react'
import { ShiftCard, type ShiftBadge } from '../components/ShiftCard'
import { effectiveEndMs, periodTotals } from '../lib/durations'
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
import type { EditRequest, PeriodFilter, Shift } from '../types'

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

/** History / dashboard: filters, period totals, shifts grouped by day. */
export function History({
  uid,
  candidates,
  observedActiveId,
  onEdit,
}: {
  uid: string
  /** Global open-query docs — merged into reconcile detection. */
  candidates: Shift[]
  observedActiveId: string | null | undefined
  onEdit: (target: EditRequest) => void
}) {
  const now = useNow(true)
  const [filter, setFilterRaw] = useState<PeriodFilter>(loadLastFilter)
  const [anchorMs, setAnchorMs] = useState(() => Date.now())
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(Date.now()))
  const [customTo, setCustomTo] = useState(() => toDateInputValue(Date.now()))
  const [limit, setLimit] = useState(PAGE_SIZE)
  const lastGoodCustom = useRef<PeriodRange | null>(null)

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

  const { shifts, meta } = usePeriodShifts(uid, range.start, range.end)

  const merged = useMemo(() => {
    const byId = new Map(shifts.map((s) => [s.id, s]))
    for (const c of candidates) if (!byId.has(c.id)) byId.set(c.id, c)
    return [...byId.values()]
  }, [shifts, candidates])
  const flags = useReconcile(uid, merged, observedActiveId)

  const isCurrent = now >= range.start && now < range.end
  const totals = periodTotals(shifts, now)

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
    <div className="mx-auto max-w-md px-4 pt-4 pb-28">
      {/* Filter chips + add */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(['day', 'week', 'month', 'custom'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`min-h-11 shrink-0 rounded-full px-3.5 text-sm font-medium capitalize ${
              filter === f
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-300 bg-white text-slate-600'
            }`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <button
          type="button"
          aria-label="Add shift"
          className="ml-auto flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-medium text-emerald-700"
          onClick={() => onEdit({ kind: 'add' })}
        >
          ＋
        </button>
      </div>

      {filter === 'custom' ? (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="From date"
              className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base"
              value={customFrom}
              max={toDateInputValue(now)}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              aria-label="To date"
              className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base"
              value={customTo}
              min={customFrom}
              max={toDateInputValue(now)}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
          {customError && (
            <p className="mt-1 text-sm text-red-600">{customError}</p>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous period"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-slate-500 active:bg-slate-100"
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
            <span className="block text-lg font-semibold text-slate-900">
              {header.title}
            </span>
            <span className="block text-xs text-slate-500">{header.sub}</span>
          </button>
          <div className="flex items-center gap-1">
            {!isCurrent && (
              <button
                type="button"
                className="min-h-11 rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600"
                onClick={() => {
                  setAnchorMs(Date.now())
                  setLimit(PAGE_SIZE)
                }}
              >
                Today
              </button>
            )}
            <button
              type="button"
              aria-label="Next period"
              disabled={range.end > now}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-slate-500 active:bg-slate-100 disabled:opacity-30"
              onClick={() => {
                setAnchorMs(range.end)
                setLimit(PAGE_SIZE)
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Totals card */}
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-xs">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-slate-900">
            Worked {formatDuration(totals.workedMs)}
          </span>
          {meta.fromCache && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <span className="inline-block h-3 w-10 animate-pulse rounded bg-slate-200" />
              updating…
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          Shifts {formatDuration(totals.shiftMs)} · Breaks{' '}
          {formatDuration(totals.breakMs)}
        </p>
      </div>

      {/* Shift list */}
      {!meta.serverSeen && shifts.length === 0 ? (
        <div className="mt-4 space-y-2">
          <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
          <p className="text-center text-sm text-slate-500">
            Loading your shifts…
          </p>
        </div>
      ) : shifts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No shifts in this period · 0 m
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {visibleGroups.map(({ key: k, take, full }) => {
            const dayTotals = periodTotals(full, now)
            return (
              <section key={k}>
                <h3 className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-slate-500">
                  <span>{formatDayHeader(resolveMs(full[0].start))}</span>
                  <span>Worked {formatDuration(dayTotals.workedMs)}</span>
                </h3>
                <div className="flex flex-col gap-2">
                  {take.map((s) => (
                    <ShiftCard
                      key={s.id}
                      shift={s}
                      nowMs={now}
                      endMs={effectiveEndMs(s)}
                      badges={badgesFor(s)}
                      onTap={() => onEdit({ kind: 'edit', shiftId: s.id })}
                    />
                  ))}
                </div>
              </section>
            )
          })}
          {hasMore && (
            <button
              type="button"
              className="min-h-11 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-600"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
            >
              Load more
            </button>
          )}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-500">
        Shifts are shown on the day they started.
      </p>
    </div>
  )
}

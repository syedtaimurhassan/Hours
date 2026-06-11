/**
 * Reconciliation: detection + guided repair beats prevention (§ design 5.5).
 * `detect()` is a pure function over the loaded shifts returning idempotent
 * repair actions and UI flags; `applyRepair()` re-verifies every condition on
 * fresh data inside an online transaction, so concurrent repairs from two
 * devices converge instead of fighting.
 */
import type { Break, Shift } from '../types'
import { effectiveEndMs, isOpen } from './durations'
import { resolveMs } from './time'

export type Repair =
  | { kind: 'foldClaims'; shiftId: string } // rule 2: end==null + claims → fold earliest
  | { kind: 'cleanMootClaims'; shiftId: string } // rule 2b: manual end + claims → delete claims
  | { kind: 'normalizeBreaks'; shiftId: string } // rules 3/4/8/9: close, clamp, union, dedupe-open
  | { kind: 'fixFlag'; desiredActiveId: string | null } // rule 7: advisory-flag freshness

export type ReconcileResult = {
  repairs: Repair[]
  /** Rule 1: offline double-start — mandatory Fix-overlap dialog, never auto. */
  multipleOpenIds: string[]
  /** Rule 5: end ≤ start — ⚠ Check times badge, no auto-fix. */
  badTimesIds: string[]
  /** Rule 6: overlapping committed shifts — ⚠ Overlap badge for manual fix. */
  overlapIds: string[]
}

type ResolvedBreak = { id: string; startMs: number; endMs: number | null }

/**
 * The canonical break set for a shift, or null when already canonical:
 * - on an ended shift every break is closed at ≤ effectiveEnd;
 * - breaks are clamped to the shift window, empty ones dropped;
 * - overlapping closed intervals are unioned (ids deterministic across
 *   devices: `n<startMs>`, so concurrent repairs converge);
 * - an open shift keeps exactly ONE open break (the earliest; its id is
 *   preserved because resume targets it), others merge into it.
 */
export function desiredBreaks(shift: Shift): Record<string, Break | null> | null {
  const startMs = resolveMs(shift.start)
  const eff = effectiveEndMs(shift)
  const entries = Object.entries(shift.breaks ?? {})
  if (entries.length === 0) return null

  const resolved: ResolvedBreak[] = entries.map(([id, b]) => ({
    id,
    startMs: resolveMs(b.start),
    endMs: b.end ? resolveMs(b.end) : null,
  }))

  // Close everything on an ended shift; on an open shift keep the earliest
  // open break, merging later open breaks into it.
  let openKept: ResolvedBreak | null = null
  const closed: ResolvedBreak[] = []
  for (const b of resolved) {
    if (b.endMs === null) {
      if (eff !== null) {
        closed.push({ ...b, endMs: eff })
      } else if (openKept === null || b.startMs < openKept.startMs) {
        if (openKept) closed.push({ ...openKept, endMs: openKept.startMs }) // zero-length → dropped
        openKept = b
      } else {
        closed.push({ ...b, endMs: b.startMs }) // zero-length → dropped (covered by openKept)
      }
    } else {
      closed.push(b)
    }
  }

  const endBound = eff ?? Number.POSITIVE_INFINITY
  const clamped = closed
    .map((b) => ({
      ...b,
      startMs: Math.max(b.startMs, startMs),
      endMs: Math.min(b.endMs as number, endBound),
    }))
    .filter((b) => (b.endMs as number) > b.startMs)
    .sort((a, b) => a.startMs - b.startMs)

  const unioned: ResolvedBreak[] = []
  for (const b of clamped) {
    const last = unioned[unioned.length - 1]
    if (last && b.startMs <= (last.endMs as number)) {
      last.endMs = Math.max(last.endMs as number, b.endMs as number)
    } else {
      unioned.push({ ...b })
    }
  }

  if (openKept) {
    const clampedOpenStart = Math.max(openKept.startMs, startMs)
    // Absorb closed intervals that overlap the open break's start.
    let openStart = clampedOpenStart
    const survivors: ResolvedBreak[] = []
    for (const b of unioned) {
      if ((b.endMs as number) >= openStart) {
        openStart = Math.min(openStart, b.startMs)
      } else {
        survivors.push(b)
      }
    }
    survivors.push({ id: openKept.id, startMs: openStart, endMs: null })
    unioned.length = 0
    unioned.push(...survivors)
  }

  // Compare with the original set; reuse original ids for unchanged intervals.
  const desired: Record<string, Break | null> = {}
  const originalById = new Map(resolved.map((b) => [b.id, b]))
  let changed = unioned.length !== resolved.length
  const usedIds = new Set<string>()
  for (const b of unioned) {
    const orig = originalById.get(b.id)
    const matchesOriginal =
      orig && orig.startMs === b.startMs && orig.endMs === b.endMs
    const id = matchesOriginal || b.endMs === null ? b.id : `n${b.startMs}`
    usedIds.add(id)
    if (matchesOriginal) {
      desired[id] = shift.breaks[b.id]
      if (id !== b.id) changed = true
    } else {
      changed = true
      desired[id] = {
        start: { ms: b.startMs, srv: null },
        end: b.endMs === null ? null : { ms: b.endMs, srv: null },
      }
    }
  }
  for (const [id] of entries) {
    if (!usedIds.has(id)) {
      changed = true
      desired[id] = null // delete marker
    }
  }
  return changed ? desired : null
}

function intervalOf(s: Shift, nowMs: number): { start: number; end: number } {
  return { start: resolveMs(s.start), end: effectiveEndMs(s) ?? nowMs }
}

/**
 * @param observedActiveId the live value of meta/state.activeShiftId, or
 *   `undefined` when not yet known — fixFlag is emitted only when the
 *   observed flag actually disagrees (applyRepair re-verifies regardless).
 */
export function detect(
  shifts: Shift[],
  nowMs: number,
  observedActiveId?: string | null,
): ReconcileResult {
  const repairs: Repair[] = []
  const badTimesIds: string[] = []
  const live = shifts.filter((s) => !s.deleted)

  for (const s of live) {
    const claims = Object.keys(s.stopClaims ?? {})
    if (s.end === null && claims.length > 0) {
      repairs.push({ kind: 'foldClaims', shiftId: s.id })
    } else if (s.end && s.end.srv === null && claims.length > 0) {
      repairs.push({ kind: 'cleanMootClaims', shiftId: s.id })
    }
    if (desiredBreaks(s) !== null) {
      repairs.push({ kind: 'normalizeBreaks', shiftId: s.id })
    }
    const eff = effectiveEndMs(s)
    if (eff !== null && eff <= resolveMs(s.start)) badTimesIds.push(s.id)
  }

  const open = live
    .filter((s) => isOpen(s))
    .sort((a, b) => resolveMs(a.start) - resolveMs(b.start))
  const multipleOpenIds = open.length > 1 ? open.map((s) => s.id) : []

  // Rule 6: pairwise sweep over sane intervals.
  const overlapIds = new Set<string>()
  const sane = live
    .filter((s) => !badTimesIds.includes(s.id))
    .map((s) => ({ id: s.id, ...intervalOf(s, nowMs) }))
    .sort((a, b) => a.start - b.start)
  for (let i = 1; i < sane.length; i++) {
    let maxPrevEnd = -Infinity
    let maxPrevId = ''
    for (let j = 0; j < i; j++) {
      if (sane[j].end > maxPrevEnd) {
        maxPrevEnd = sane[j].end
        maxPrevId = sane[j].id
      }
    }
    if (sane[i].start < maxPrevEnd) {
      overlapIds.add(sane[i].id)
      overlapIds.add(maxPrevId)
    }
  }

  // Rule 7 — only when the open set is unambiguous (dialog handles rule 1)
  // and the observed flag actually disagrees.
  if (open.length <= 1) {
    const desired = open[0]?.id ?? null
    if (observedActiveId !== undefined && observedActiveId !== desired) {
      repairs.push({ kind: 'fixFlag', desiredActiveId: desired })
    }
  }

  return {
    repairs,
    multipleOpenIds,
    badTimesIds,
    overlapIds: [...overlapIds],
  }
}

/** Stable throttle key for a repair. */
export function repairKey(r: Repair): string {
  return r.kind === 'fixFlag' ? `fixFlag:${r.desiredActiveId}` : `${r.kind}:${r.shiftId}`
}

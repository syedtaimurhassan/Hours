import { describe, expect, it } from 'vitest'
import { srvStamp } from '../src/lib/durations'
import { desiredBreaks, detect, repairKey } from '../src/lib/reconcile'
import type { Repair } from '../src/lib/reconcile'
import { wallToEpoch } from '../src/lib/time'
import type { Shift, Stamp } from '../src/types'

const H = 3_600_000
const MIN = 60_000
const T0 = wallToEpoch(2026, 6, 9, 9, 0)
const NOW = T0 + 10 * H

const live = (ms: number): Stamp => ({ ms, srv: srvStamp(ms) })
const manual = (ms: number): Stamp => ({ ms, srv: null })

function mkShift(partial: Partial<Shift> & { id: string }): Shift {
  return {
    start: live(T0),
    end: null,
    stopClaims: {},
    breaks: {},
    deleted: false,
    deletedAtMs: null,
    createdAt: srvStamp(T0),
    updatedAt: srvStamp(T0),
    updatedBy: 'devA',
    ...partial,
  }
}

const kinds = (repairs: Repair[]) => repairs.map((r) => r.kind).sort()

describe('rule 1 — multiple open shifts (offline double-start)', () => {
  it('flags for the mandatory dialog, never auto-repairs, and defers fixFlag', () => {
    const a = mkShift({ id: 'a', start: live(T0) })
    const b = mkShift({ id: 'b', start: live(T0 + H) })
    const r = detect([a, b], NOW, null)
    expect(r.multipleOpenIds).toEqual(['a', 'b']) // earliest first
    expect(r.repairs).toEqual([]) // no auto-resolution of the double-open
  })
})

describe('rules 2/2b — stopClaims folding', () => {
  it('end==null with claims → foldClaims', () => {
    const s = mkShift({
      id: 's',
      stopClaims: { devB: live(T0 + 6 * H) },
    })
    const r = detect([s], NOW, null)
    expect(r.repairs).toContainEqual({ kind: 'foldClaims', shiftId: 's' })
  })

  it('manual end with late claims → cleanMootClaims only', () => {
    const s = mkShift({
      id: 's',
      end: manual(T0 + 8 * H),
      stopClaims: { devB: live(T0 + 6 * H) },
    })
    const r = detect([s], NOW, 'ignored' as never)
    expect(r.repairs.some((x) => x.kind === 'cleanMootClaims')).toBe(true)
    expect(r.repairs.some((x) => x.kind === 'foldClaims')).toBe(false)
  })

  it('live end with claims is NOT folded (effectiveEnd already min()s them)', () => {
    const s = mkShift({
      id: 's',
      end: live(T0 + 8 * H),
      stopClaims: { devB: live(T0 + 6 * H) },
    })
    const r = detect([s], NOW, null)
    expect(kinds(r.repairs)).not.toContain('foldClaims')
    expect(kinds(r.repairs)).not.toContain('cleanMootClaims')
  })
})

describe('rules 3/4/8/9 — desiredBreaks normalization', () => {
  it('returns null when breaks are already canonical', () => {
    const s = mkShift({
      id: 's',
      end: live(T0 + 8 * H),
      breaks: {
        b1: { start: live(T0 + 2 * H), end: live(T0 + 2 * H + 30 * MIN) },
      },
    })
    expect(desiredBreaks(s)).toBeNull()
  })

  it('rule 3: open break on an ended shift is closed at effectiveEnd', () => {
    const s = mkShift({
      id: 's',
      end: live(T0 + 8 * H),
      breaks: { b1: { start: live(T0 + 7 * H), end: null } },
    })
    const d = desiredBreaks(s)!
    expect(d).not.toBeNull()
    const closed = Object.values(d).find((b) => b !== null)!
    expect(closed.end!.ms).toBe(T0 + 8 * H)
  })

  it('rule 4: break outside the window is trimmed; fully outside deleted', () => {
    const s = mkShift({
      id: 's',
      end: live(T0 + 8 * H),
      breaks: {
        partial: { start: live(T0 - H), end: live(T0 + H) },
        outside: { start: live(T0 + 9 * H), end: live(T0 + 10 * H) },
      },
    })
    const d = desiredBreaks(s)!
    expect(d.outside).toBeNull() // delete marker
    const trimmed = Object.entries(d).find(([, b]) => b !== null)![1]!
    expect(trimmed.start.ms).toBe(T0)
    expect(trimmed.end!.ms).toBe(T0 + H)
  })

  it('rule 8: overlapping closed breaks are unioned with deterministic ids', () => {
    const s = mkShift({
      id: 's',
      end: live(T0 + 8 * H),
      breaks: {
        b1: { start: live(T0 + 2 * H), end: live(T0 + 3 * H) },
        b2: { start: live(T0 + 2 * H + 30 * MIN), end: live(T0 + 4 * H) },
      },
    })
    const d = desiredBreaks(s)!
    expect(d.b1).toBeNull()
    expect(d.b2).toBeNull()
    const merged = d[`n${T0 + 2 * H}`]!
    expect(merged.start.ms).toBe(T0 + 2 * H)
    expect(merged.end!.ms).toBe(T0 + 4 * H)
  })

  it('rule 9: two open breaks on a running shift keep the earliest id', () => {
    const s = mkShift({
      id: 's',
      breaks: {
        late: { start: live(T0 + 3 * H), end: null },
        early: { start: live(T0 + 2 * H), end: null },
      },
    })
    const d = desiredBreaks(s)!
    expect(d.late).toBeNull()
    expect(d.early).not.toBeNull()
    expect(d.early!.end).toBeNull() // still open — resume keeps targeting it
    expect(d.early!.start.ms).toBe(T0 + 2 * H)
  })

  it('a closed break overlapping the open break is absorbed into it', () => {
    const s = mkShift({
      id: 's',
      breaks: {
        closed: { start: live(T0 + 2 * H), end: live(T0 + 3 * H) },
        open: { start: live(T0 + 2 * H + 30 * MIN), end: null },
      },
    })
    const d = desiredBreaks(s)!
    expect(d.closed).toBeNull()
    expect(d.open!.start.ms).toBe(T0 + 2 * H)
    expect(d.open!.end).toBeNull()
  })
})

describe('rule 5 — bad times flagged, never auto-fixed', () => {
  it('end ≤ start gets the badge and no repair', () => {
    const s = mkShift({ id: 's', end: live(T0 - H) })
    const r = detect([s], NOW, null)
    expect(r.badTimesIds).toEqual(['s'])
    expect(r.repairs.filter((x) => x.kind !== 'fixFlag')).toEqual([])
  })
})

describe('rule 6 — overlapping committed shifts flagged', () => {
  it('flags both shifts of an overlapping pair', () => {
    const a = mkShift({ id: 'a', end: live(T0 + 8 * H) })
    const b = mkShift({
      id: 'b',
      start: live(T0 + 7 * H),
      end: live(T0 + 9 * H),
    })
    const r = detect([a, b], NOW, null)
    expect(r.overlapIds.sort()).toEqual(['a', 'b'])
  })

  it('sequential shifts are not flagged', () => {
    const a = mkShift({ id: 'a', end: live(T0 + 4 * H) })
    const b = mkShift({
      id: 'b',
      start: live(T0 + 4 * H),
      end: live(T0 + 8 * H),
    })
    expect(detect([a, b], NOW, null).overlapIds).toEqual([])
  })
})

describe('rule 7 — advisory-flag freshness', () => {
  it('flag pointing at an ended shift → clear', () => {
    const s = mkShift({ id: 's', end: live(T0 + 8 * H) })
    const r = detect([s], NOW, 's')
    expect(r.repairs).toContainEqual({ kind: 'fixFlag', desiredActiveId: null })
  })

  it('flag null while one shift is open → point at it', () => {
    const s = mkShift({ id: 's' })
    const r = detect([s], NOW, null)
    expect(r.repairs).toContainEqual({ kind: 'fixFlag', desiredActiveId: 's' })
  })

  it('flag already correct → no repair', () => {
    const s = mkShift({ id: 's' })
    expect(detect([s], NOW, 's').repairs).toEqual([])
  })

  it('flag unknown (state doc not yet loaded) → no churn', () => {
    const s = mkShift({ id: 's' })
    expect(detect([s], NOW, undefined).repairs).toEqual([])
  })
})

describe('repairKey throttling identity', () => {
  it('is stable per action', () => {
    expect(repairKey({ kind: 'foldClaims', shiftId: 'x' })).toBe('foldClaims:x')
    expect(repairKey({ kind: 'fixFlag', desiredActiveId: null })).toBe(
      'fixFlag:null',
    )
  })
})

describe('undo matrix invariants (pure consequences)', () => {
  it('undo-end leaves no self-claim: a shift with end=null and no claims is open', () => {
    // After undoEnd: end=null, our stopClaim deleted, auto-closed break reopened.
    const s = mkShift({
      id: 's',
      breaks: { b1: { start: live(T0 + 2 * H), end: null } },
    })
    const r = detect([s], NOW, 's')
    expect(r.multipleOpenIds).toEqual([])
    expect(r.repairs).toEqual([]) // nothing to repair — state is canonical
  })

  it('discarded active shift is ignored everywhere', () => {
    const s = mkShift({ id: 's', deleted: true, deletedAtMs: NOW })
    const r = detect([s], NOW, 's')
    // deleted shift can't hold the lock → flag cleared
    expect(r.repairs).toContainEqual({ kind: 'fixFlag', desiredActiveId: null })
    expect(r.multipleOpenIds).toEqual([])
  })
})

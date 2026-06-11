import {
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type QuerySnapshot,
} from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../firebase'
import type { Shift } from '../types'
import { maybeRecordClockOffset } from './clock'
import { docToShift } from './convert'
import { getDeviceId } from './deviceId'
import { effectiveEndMs } from './durations'
import { shiftsCol } from './shifts'
import { SKEW_LIMIT_MS, resolveMs } from './time'

export type SnapMeta = {
  /** Latest snapshot served from cache only (offline indicator + the
   * known-offline fast path for taps). */
  fromCache: boolean
  /** Number of loaded docs with unsynced local writes (sync badge). */
  pendingCount: number
  /**
   * Empty states are gated on this: true once we've seen a server-confirmed
   * snapshot OR a cache snapshot that actually has docs. A fresh device gets
   * an empty cache snapshot seconds before months of data arrive — showing
   * "No shifts yet" in that gap is the panic this prevents.
   */
  serverSeen: boolean
}

const INITIAL_META: SnapMeta = {
  fromCache: true,
  pendingCount: 0,
  serverSeen: false,
}

function readSnapshot(snap: QuerySnapshot): {
  shifts: Shift[]
  pendingCount: number
} {
  const shifts: Shift[] = []
  let pendingCount = 0
  const deviceId = getDeviceId()
  const now = Date.now()
  for (const d of snap.docs) {
    const shift = docToShift(d.id, d.data({ serverTimestamps: 'estimate' }))
    if (d.metadata.hasPendingWrites) {
      pendingCount++
      shift.pendingWrite = true
    }
    // Clock-offset probe: a server-acked stamp from this device, acked within
    // seconds of the tap, measures the device-clock error.
    if (
      !d.metadata.hasPendingWrites &&
      shift.updatedBy === deviceId &&
      shift.start.srv
    ) {
      maybeRecordClockOffset(shift.start.srv.toMillis(), shift.start.ms, now)
    }
    shifts.push(shift)
  }
  return { shifts, pendingCount }
}

/**
 * All candidate-open shifts (end == null), unwindowed — restores the running
 * shift on any device after app kill, reboot, or a brand-new phone. Includes
 * docs ended only by stopClaims; callers filter on effectiveEndMs.
 */
export function useOpenShifts(uid: string): {
  openShifts: Shift[]
  candidates: Shift[]
  meta: SnapMeta
} {
  const [state, setState] = useState<{ shifts: Shift[]; meta: SnapMeta }>({
    shifts: [],
    meta: INITIAL_META,
  })

  useEffect(() => {
    const q = query(shiftsCol(uid), where('end', '==', null))
    setState({ shifts: [], meta: INITIAL_META })
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const { shifts, pendingCount } = readSnapshot(snap)
        setState((prev) => ({
          shifts,
          meta: {
            fromCache: snap.metadata.fromCache,
            pendingCount,
            serverSeen:
              prev.meta.serverSeen || !snap.metadata.fromCache || shifts.length > 0,
          },
        }))
      },
      () => {
        // Listener error (e.g. permission-denied) is surfaced by useSyncError.
      },
    )
  }, [uid])

  const openShifts = useMemo(
    () =>
      state.shifts
        .filter((s) => !s.deleted && effectiveEndMs(s) === null)
        .sort((a, b) => resolveMs(a.start) - resolveMs(b.start)),
    [state.shifts],
  )
  return { openShifts, candidates: state.shifts, meta: state.meta }
}

/**
 * Shifts in a period. Firestore range on raw start.ms padded by SKEW_LIMIT,
 * re-filtered client-side on resolveMs(start) — the canonical attribution
 * value — and on `deleted` (avoids a composite index; a few soft-deleted docs
 * per window is negligible read cost).
 */
export function usePeriodShifts(
  uid: string,
  startMs: number,
  endMs: number,
): { shifts: Shift[]; deletedInRange: Shift[]; meta: SnapMeta } {
  const [state, setState] = useState<{ shifts: Shift[]; meta: SnapMeta }>({
    shifts: [],
    meta: INITIAL_META,
  })

  useEffect(() => {
    const q = query(
      shiftsCol(uid),
      where('start.ms', '>=', startMs - SKEW_LIMIT_MS),
      where('start.ms', '<', endMs + SKEW_LIMIT_MS),
      orderBy('start.ms', 'desc'),
    )
    setState({ shifts: [], meta: INITIAL_META })
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const { shifts, pendingCount } = readSnapshot(snap)
        setState((prev) => ({
          shifts,
          meta: {
            fromCache: snap.metadata.fromCache,
            pendingCount,
            serverSeen:
              prev.meta.serverSeen || !snap.metadata.fromCache || shifts.length > 0,
          },
        }))
      },
      () => {},
    )
  }, [uid, startMs, endMs])

  const inRange = useMemo(
    () =>
      state.shifts.filter((s) => {
        const ms = resolveMs(s.start)
        return ms >= startMs && ms < endMs
      }),
    [state.shifts, startMs, endMs],
  )
  const shifts = useMemo(() => inRange.filter((s) => !s.deleted), [inRange])
  const deletedInRange = useMemo(
    () => inRange.filter((s) => s.deleted),
    [inRange],
  )
  return { shifts, deletedInRange, meta: state.meta }
}

/**
 * Live view of one shift document — sheets edit against this instead of a
 * stale prop captured at tap time. `undefined` = loading, `null` = missing.
 */
export function useShiftDoc(
  uid: string,
  shiftId: string | null,
): Shift | null | undefined {
  // Track which shiftId the value belongs to, and reset SYNCHRONOUSLY when
  // shiftId changes (React "adjust state during render" pattern). Otherwise the
  // hook would return the PREVIOUS id's resolved value (a stale `null`) for one
  // render after a tap — and App's "deleted remotely" guard would read that
  // null and close the editor before it ever opens. `undefined` = loading,
  // `null` = genuinely missing.
  const [entry, setEntry] = useState<{
    id: string | null
    shift: Shift | null | undefined
  }>(() => ({ id: shiftId, shift: shiftId ? undefined : null }))

  if (entry.id !== shiftId) {
    setEntry({ id: shiftId, shift: shiftId ? undefined : null })
  }

  useEffect(() => {
    if (!shiftId) return
    return onSnapshot(
      doc(db, 'users', uid, 'shifts', shiftId),
      (snap) =>
        setEntry({
          id: shiftId,
          shift: snap.exists()
            ? docToShift(snap.id, snap.data({ serverTimestamps: 'estimate' }))
            : null,
        }),
      () => {},
    )
  }, [uid, shiftId])

  return entry.id === shiftId ? entry.shift : shiftId ? undefined : null
}

/**
 * Listener-level sync errors (permission-denied must never masquerade as
 * "offline"; resource-exhausted gets its own copy).
 */
export function useSyncError(uid: string): string | null {
  const [error, setError] = useState<string | null>(null)
  const retried = useRef(false)
  useEffect(() => {
    setError(null)
    retried.current = false
    const q = query(shiftsCol(uid), where('end', '==', null))
    return onSnapshot(
      q,
      () => setError(null),
      (err) => {
        const code = (err as { code?: string })?.code ?? ''
        if (code === 'permission-denied') {
          setError(
            'Sync error — permission denied. Check the Firestore security rules.',
          )
        } else if (code === 'resource-exhausted') {
          setError(
            'Sync temporarily unavailable — your data is saved on this device and will sync later.',
          )
        } else {
          setError(null) // transient network errors are the offline badge's job
        }
      },
    )
  }, [uid])
  return error
}

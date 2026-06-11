import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../firebase'
import type { Shift } from '../types'
import { detect, repairKey, type ReconcileResult } from './reconcile'
import { applyRepair } from './reconcileApply'

const RETRY_INTERVAL_MS = 30_000
// Module-level so Track and History never double-fire the same repair.
const attemptedAt = new Map<string, number>()

/** Live value of the advisory flag; `undefined` until the doc loads. */
export function useActiveFlag(uid: string): string | null | undefined {
  const [flag, setFlag] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    setFlag(undefined)
    return onSnapshot(
      doc(db, 'users', uid, 'meta', 'state'),
      (snap) => setFlag((snap.data()?.activeShiftId ?? null) as string | null),
      () => {},
    )
  }, [uid])
  return flag
}

const EMPTY: ReconcileResult = {
  repairs: [],
  multipleOpenIds: [],
  badTimesIds: [],
  overlapIds: [],
}

/**
 * Detection runs on every snapshot of the given shifts; repairs fire as
 * throttled, idempotent online transactions (offline failures are ignored —
 * the next snapshot re-triggers). Returns the UI flags.
 */
export function useReconcile(
  uid: string,
  shifts: Shift[],
  observedActiveId: string | null | undefined,
): ReconcileResult {
  const [flags, setFlags] = useState<ReconcileResult>(EMPTY)

  useEffect(() => {
    const result = detect(shifts, Date.now(), observedActiveId)
    setFlags(result)
    for (const repair of result.repairs) {
      const key = repairKey(repair)
      const last = attemptedAt.get(key) ?? 0
      if (Date.now() - last < RETRY_INTERVAL_MS) continue
      attemptedAt.set(key, Date.now())
      applyRepair(uid, repair).catch(() => {})
    }
  }, [uid, shifts, observedActiveId])

  return useMemo(() => flags, [flags])
}

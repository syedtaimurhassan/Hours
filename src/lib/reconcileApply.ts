/**
 * Firebase side of reconciliation — kept separate from the pure detection in
 * reconcile.ts so the latter stays importable in node tests.
 */
import {
  deleteField,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type UpdateData,
} from 'firebase/firestore'
import { db } from '../firebase'
import { docToShift } from './convert'
import { getDeviceId } from './deviceId'
import { isOpen } from './durations'
import { desiredBreaks, type Repair } from './reconcile'
import { shiftRef, stateRef } from './shifts'
import { resolveMs } from './time'

/**
 * Apply one repair as an online transaction, re-verifying on fresh data.
 * Rejects offline ('unavailable') — callers ignore failures; the next
 * snapshot re-triggers detection.
 */
export async function applyRepair(uid: string, repair: Repair): Promise<void> {
  const metaUpdates = () => ({
    updatedAt: serverTimestamp(),
    updatedBy: getDeviceId(),
  })

  if (repair.kind === 'fixFlag') {
    await runTransaction(db, async (tx) => {
      const sRef = stateRef(uid)
      const stateSnap = await tx.get(sRef)
      const current = (stateSnap.data()?.activeShiftId ?? null) as string | null
      if (current === repair.desiredActiveId) return
      if (repair.desiredActiveId !== null) {
        const snap = await tx.get(shiftRef(uid, repair.desiredActiveId))
        if (!snap.exists()) return
        const fresh = docToShift(snap.id, snap.data())
        if (!isOpen(fresh)) return
      } else if (current !== null) {
        // Clearing: verify the referenced shift is genuinely not open.
        const snap = await tx.get(shiftRef(uid, current))
        if (snap.exists() && isOpen(docToShift(snap.id, snap.data()))) return
      }
      tx.set(sRef, {
        activeShiftId: repair.desiredActiveId,
        updatedAt: serverTimestamp(),
      })
    })
    return
  }

  await runTransaction(db, async (tx) => {
    const ref = shiftRef(uid, repair.shiftId)
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const raw = snap.data()
    const fresh = docToShift(snap.id, raw)
    if (fresh.deleted) return

    if (repair.kind === 'foldClaims') {
      if (fresh.end !== null) return // someone else folded/ended meanwhile
      const claimEntries = Object.entries(fresh.stopClaims ?? {})
      if (claimEntries.length === 0) return
      const earliest = claimEntries.reduce((a, b) =>
        resolveMs(a[1]) <= resolveMs(b[1]) ? a : b,
      )
      const rawClaim = (raw.stopClaims ?? {})[earliest[0]] as
        | { ms?: number; srv?: unknown }
        | undefined
      const updates: UpdateData<DocumentData> = {
        // Preserve the claim's stamps so resolveMs behaves identically.
        end: { ms: rawClaim?.ms ?? earliest[1].ms, srv: rawClaim?.srv ?? null },
        ...metaUpdates(),
      }
      for (const [dev] of claimEntries) {
        updates[`stopClaims.${dev}`] = deleteField()
      }
      tx.update(ref, updates)
      return
    }

    if (repair.kind === 'cleanMootClaims') {
      if (!(fresh.end && fresh.end.srv === null)) return
      const devs = Object.keys(fresh.stopClaims ?? {})
      if (devs.length === 0) return
      const updates: UpdateData<DocumentData> = { ...metaUpdates() }
      for (const dev of devs) updates[`stopClaims.${dev}`] = deleteField()
      tx.update(ref, updates)
      return
    }

    // normalizeBreaks
    const desired = desiredBreaks(fresh)
    if (desired === null) return
    const updates: UpdateData<DocumentData> = { ...metaUpdates() }
    for (const [id, b] of Object.entries(desired)) {
      updates[`breaks.${id}`] = b === null ? deleteField() : b
    }
    tx.update(ref, updates)
  })
}

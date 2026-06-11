/**
 * All shift mutations. One universal pattern (§ design 5.2):
 *
 * Step 0, synchronously in the tap handler: capture tapMs = Date.now() and
 * (for creates) shiftId = crypto.randomUUID(). tapMs is used for every Stamp
 * regardless of transaction retries — NEVER call Date.now() inside a
 * transaction closure (retries would re-stamp the tap).
 *
 * Then:
 * - Known-offline fast path: skip straight to the optimistic local batch.
 * - Otherwise race the Firestore transaction against a 3 s deadline.
 *   Web-SDK transactions read from the server only and cannot commit offline —
 *   exactly why lie-fi would otherwise hang the button. On timeout or
 *   `unavailable`, fall through to the batch with the SAME shiftId and tapMs,
 *   so a late-committing abandoned transaction and the batch are idempotent on
 *   one document instead of creating two shifts from one tap.
 *
 * The tap is never lost, never re-stamped, and never gated on
 * navigator.onLine. Offline paths NEVER write meta/state — a queued blind
 * flag write would land via last-write-wins long after the world has moved on
 * and clobber a newer lock. The shift docs are the lock; the flag is advisory.
 */
import {
  collection,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Transaction,
  type UpdateData,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Shift } from '../types'
import { correctedMs } from './clock'
import { docToShift } from './convert'
import { getDeviceId } from './deviceId'
import { effectiveEndMs, openBreakId } from './durations'
import { resolveMs } from './time'

const TX_DEADLINE_MS = 3_000

export type OpErrorCode =
  | 'already-running' // another open shift genuinely exists
  | 'already-ended' // first stop won on another device
  | 'shift-deleted' // shift was deleted on another device
  | 'undo-lock-taken' // another shift acquired the lock; undo-end aborted

export class OpError extends Error {
  constructor(
    public code: OpErrorCode,
    message?: string,
  ) {
    super(message ?? code)
  }
}

class Abandoned extends Error {}

export const shiftsCol = (uid: string) => collection(db, 'users', uid, 'shifts')
export const shiftRef = (uid: string, id: string) =>
  doc(db, 'users', uid, 'shifts', id)
export const stateRef = (uid: string) => doc(db, 'users', uid, 'meta', 'state')

const liveStamp = (tapMs: number) => ({ ms: tapMs, srv: serverTimestamp() })
// Offline-path stamps correct for known device-clock error; srv still resolves
// at sync time (resolveMs prefers ms when the queue delay exceeds SKEW_LIMIT).
const offlineStamp = (tapMs: number) => ({
  ms: correctedMs(tapMs),
  srv: serverTimestamp(),
})
const manualStamp = (ms: number) => ({ ms, srv: null })

const meta = () => ({
  updatedAt: serverTimestamp(),
  updatedBy: getDeviceId(),
})

async function getShiftInTx(
  tx: Transaction,
  ref: DocumentReference,
): Promise<Shift | null> {
  const snap = await tx.get(ref)
  if (!snap.exists()) return null
  return docToShift(snap.id, snap.data())
}

/**
 * Race a transaction against the deadline. The closure must call
 * `checkAbandoned()` after each await so a late-resuming closure aborts
 * instead of double-committing alongside the fallback batch.
 */
async function raceTx<T>(
  run: (tx: Transaction, checkAbandoned: () => void) => Promise<T>,
): Promise<{ outcome: 'committed'; value: T } | { outcome: 'fallback' }> {
  let abandoned = false
  const checkAbandoned = () => {
    if (abandoned) throw new Abandoned()
  }
  const tx = runTransaction(db, (t) => run(t, checkAbandoned))
  const timeout = new Promise<'timeout'>((res) =>
    setTimeout(() => res('timeout'), TX_DEADLINE_MS),
  )
  try {
    const result = await Promise.race([tx, timeout])
    if (result === 'timeout') {
      abandoned = true
      tx.catch(() => {}) // late failure/abort is expected; never unhandled
      return { outcome: 'fallback' }
    }
    return { outcome: 'committed', value: result as T }
  } catch (err) {
    if (err instanceof OpError) throw err
    // unavailable / failed-precondition / aborted-after-retries → fallback
    return { outcome: 'fallback' }
  }
}

/**
 * Fire an optimistic local batch. commit() resolves only on server ack, so it
 * is deliberately NOT awaited — the local cache applies the write instantly
 * and the snapshot listener flips the UI; the sync badge tracks the rest.
 */
function fireBatch(build: (b: ReturnType<typeof writeBatch>) => void): void {
  const b = writeBatch(db)
  build(b)
  void b.commit().catch(() => {
    // Queued write failed at sync time (rules/deleted doc). The snapshot
    // listener and reconciliation surface any user-visible consequence.
  })
}

function creationPayload(tapMs: number, stamp: { ms: number; srv: unknown }) {
  return {
    start: stamp,
    end: null,
    stopClaims: {},
    breaks: {},
    deleted: false,
    deletedAtMs: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: getDeviceId(),
    tapMs, // diagnostic only
  }
}

export type StartArgs = {
  uid: string
  tapMs: number // captured synchronously in the tap handler
  shiftId: string // crypto.randomUUID(), captured in the tap handler
  knownOffline: boolean // latest snapshot was fromCache
}

/**
 * Start a shift. Throws OpError('already-running') only when another shift is
 * GENUINELY open (verified through the advisory flag); a dangling flag can
 * never produce a dead button or a misleading toast.
 */
export async function startShift({
  uid,
  tapMs,
  shiftId,
  knownOffline,
}: StartArgs): Promise<void> {
  const ref = shiftRef(uid, shiftId)
  const sRef = stateRef(uid)

  if (!knownOffline) {
    const result = await raceTx(async (tx, checkAbandoned) => {
      const stateSnap = await tx.get(sRef)
      checkAbandoned()
      const activeId = (stateSnap.data()?.activeShiftId ?? null) as
        | string
        | null
      if (activeId !== null && activeId !== shiftId) {
        // Verify the referenced shift — the docs are the lock, not the flag.
        const active = await getShiftInTx(tx, shiftRef(uid, activeId))
        checkAbandoned()
        if (active && !active.deleted && effectiveEndMs(active) === null) {
          throw new OpError('already-running')
        }
        // Missing / deleted / effectively ended → the lock is free.
      }
      tx.set(ref, creationPayload(tapMs, liveStamp(tapMs)))
      tx.set(sRef, { activeShiftId: shiftId, updatedAt: serverTimestamp() })
    })
    if (result.outcome === 'committed') return
  }
  // Optimistic batch: shift doc only — never meta/state from this path.
  fireBatch((b) => b.set(ref, creationPayload(tapMs, offlineStamp(tapMs))))
}

export type EndArgs = {
  uid: string
  tapMs: number
  shift: Shift // latest snapshot of the running shift
  knownOffline: boolean
}

export type EndResult = {
  /** Break auto-closed at the end stamp, if any — undo-end must reopen it. */
  closedBreakId: string | null
}

export async function endShift({
  uid,
  tapMs,
  shift,
  knownOffline,
}: EndArgs): Promise<EndResult> {
  const ref = shiftRef(uid, shift.id)
  const sRef = stateRef(uid)

  if (!knownOffline) {
    const result = await raceTx(async (tx, checkAbandoned) => {
      const fresh = await getShiftInTx(tx, ref)
      const stateSnap = await tx.get(sRef)
      checkAbandoned()
      if (!fresh || fresh.deleted) throw new OpError('shift-deleted')
      if (effectiveEndMs(fresh) !== null) throw new OpError('already-ended')
      const stamp = liveStamp(tapMs)
      const open = openBreakId(fresh)
      const updates: UpdateData<DocumentData> = { end: stamp, ...meta() }
      if (open) updates[`breaks.${open}.end`] = stamp
      tx.update(ref, updates)
      // Clear the flag ONLY if it still points here — never a blind clear.
      if (stateSnap.data()?.activeShiftId === shift.id) {
        tx.update(sRef, { activeShiftId: null, updatedAt: serverTimestamp() })
      }
      return { closedBreakId: open }
    })
    if (result.outcome === 'committed') return result.value
  }
  // Optimistic: write only this device's stop claim (field-level map merge —
  // a stale offline stop can never overwrite an earlier end via LWW) and
  // close the locally visible open break. No meta/state write.
  const stamp = offlineStamp(tapMs)
  const open = openBreakId(shift)
  fireBatch((b) => {
    const updates: UpdateData<DocumentData> = {
      [`stopClaims.${getDeviceId()}`]: stamp,
      ...meta(),
    }
    if (open) updates[`breaks.${open}.end`] = stamp
    b.update(ref, updates)
  })
  return { closedBreakId: open }
}

export type BreakArgs = {
  uid: string
  tapMs: number
  shift: Shift
  knownOffline: boolean
}

export async function pauseShift({
  uid,
  tapMs,
  shift,
  knownOffline,
}: BreakArgs): Promise<void> {
  const ref = shiftRef(uid, shift.id)
  const breakId = crypto.randomUUID()

  if (!knownOffline) {
    const result = await raceTx(async (tx, checkAbandoned) => {
      const fresh = await getShiftInTx(tx, ref)
      checkAbandoned()
      if (!fresh || fresh.deleted) throw new OpError('shift-deleted')
      if (effectiveEndMs(fresh) !== null) throw new OpError('already-ended')
      if (openBreakId(fresh) !== null) return // already paused — converge
      tx.update(ref, {
        [`breaks.${breakId}`]: { start: liveStamp(tapMs), end: null },
        ...meta(),
      })
    })
    if (result.outcome === 'committed') return
  }
  if (openBreakId(shift) !== null) return
  fireBatch((b) =>
    b.update(ref, {
      [`breaks.${breakId}`]: { start: offlineStamp(tapMs), end: null },
      ...meta(),
    }),
  )
}

export async function resumeShift({
  uid,
  tapMs,
  shift,
  knownOffline,
}: BreakArgs): Promise<void> {
  const ref = shiftRef(uid, shift.id)
  // Resume targets the specific open break id from the latest snapshot.
  const targetId = openBreakId(shift)
  if (!targetId) return

  if (!knownOffline) {
    const result = await raceTx(async (tx, checkAbandoned) => {
      const fresh = await getShiftInTx(tx, ref)
      checkAbandoned()
      if (!fresh || fresh.deleted) throw new OpError('shift-deleted')
      const open = openBreakId(fresh)
      if (!open) return // already resumed elsewhere — converge
      tx.update(ref, { [`breaks.${open}.end`]: liveStamp(tapMs), ...meta() })
    })
    if (result.outcome === 'committed') return
  }
  fireBatch((b) =>
    b.update(ref, { [`breaks.${targetId}.end`]: offlineStamp(tapMs), ...meta() }),
  )
}

/**
 * Undo-end: reopen the shift, reopen the auto-closed break, delete this
 * device's just-written stop claim (otherwise effectiveEnd re-ends the shift
 * the instant undo completes), and retake the flag IFF it is free or still
 * ours — if another shift acquired the lock meanwhile, abort.
 */
export async function undoEnd(
  uid: string,
  shiftId: string,
  closedBreakId: string | null,
  knownOffline: boolean,
): Promise<void> {
  const ref = shiftRef(uid, shiftId)
  const sRef = stateRef(uid)
  const deviceId = getDeviceId()

  const buildUpdates = () => {
    const updates: UpdateData<DocumentData> = {
      end: null,
      [`stopClaims.${deviceId}`]: deleteField(),
      ...meta(),
    }
    if (closedBreakId) updates[`breaks.${closedBreakId}.end`] = null
    return updates
  }

  if (!knownOffline) {
    const result = await raceTx(async (tx, checkAbandoned) => {
      const fresh = await getShiftInTx(tx, ref)
      const stateSnap = await tx.get(sRef)
      checkAbandoned()
      if (!fresh || fresh.deleted) throw new OpError('shift-deleted')
      const activeId = (stateSnap.data()?.activeShiftId ?? null) as
        | string
        | null
      if (activeId !== null && activeId !== shiftId) {
        throw new OpError('undo-lock-taken')
      }
      tx.update(ref, buildUpdates())
      tx.set(sRef, { activeShiftId: shiftId, updatedAt: serverTimestamp() })
    })
    if (result.outcome === 'committed') return
  }
  fireBatch((b) => b.update(ref, buildUpdates())) // flag repaired by reconcile
}

/**
 * Undo-start / recovery-sheet Discard: soft-delete an ACTIVE shift (the one
 * sanctioned exception to "never delete the active shift") and release the
 * flag iff it points here.
 */
export async function discardActiveShift(
  uid: string,
  shiftId: string,
  knownOffline: boolean,
): Promise<void> {
  const ref = shiftRef(uid, shiftId)
  const sRef = stateRef(uid)
  const tombstone = () => ({
    deleted: true,
    deletedAtMs: Date.now(),
    ...meta(),
  })

  if (!knownOffline) {
    const result = await raceTx(async (tx, checkAbandoned) => {
      const stateSnap = await tx.get(sRef)
      checkAbandoned()
      tx.update(ref, tombstone())
      if (stateSnap.data()?.activeShiftId === shiftId) {
        tx.update(sRef, { activeShiftId: null, updatedAt: serverTimestamp() })
      }
    })
    if (result.outcome === 'committed') return
  }
  fireBatch((b) => b.update(ref, tombstone()))
}

/** Soft-delete an ENDED shift (UI blocks deleting the active one). */
export async function softDeleteShift(uid: string, shiftId: string): Promise<void> {
  await Promise.race([
    updateDoc(shiftRef(uid, shiftId), {
      deleted: true,
      deletedAtMs: Date.now(),
      ...meta(),
    }),
    new Promise<void>((res) => setTimeout(res, 300)), // local-first; don't block UI on sync
  ])
}

export async function undoDelete(uid: string, shiftId: string): Promise<void> {
  await Promise.race([
    updateDoc(shiftRef(uid, shiftId), {
      deleted: false,
      deletedAtMs: null,
      ...meta(),
    }),
    new Promise<void>((res) => setTimeout(res, 300)),
  ])
}

export type BreakEdit = { id: string; startMs: number; endMs: number }

export type ShiftEdit = {
  startMs: number
  /** New end, or 'ongoing' to keep a running shift running. */
  end: number | 'ongoing'
  breaks: BreakEdit[]
}

/**
 * Manual edit from the editor. Manual stamps (srv: null) are authoritative:
 * a manual end also deletes all visible stopClaims in the same write, and
 * effectiveEnd ignores claims on manual ends even if one syncs in later.
 */
export async function saveShiftEdit(
  uid: string,
  shift: Shift,
  edit: ShiftEdit,
): Promise<void> {
  const updates: UpdateData<DocumentData> = {
    start: manualStamp(edit.startMs),
    ...meta(),
  }
  if (edit.end !== 'ongoing') {
    updates.end = manualStamp(edit.end)
    for (const dev of Object.keys(shift.stopClaims ?? {})) {
      updates[`stopClaims.${dev}`] = deleteField()
    }
  }
  const editedIds = new Set(edit.breaks.map((b) => b.id))
  for (const existingId of Object.keys(shift.breaks ?? {})) {
    if (!editedIds.has(existingId)) {
      updates[`breaks.${existingId}`] = deleteField()
    }
  }
  for (const b of edit.breaks) {
    updates[`breaks.${b.id}`] = {
      start: manualStamp(b.startMs),
      end: manualStamp(b.endMs),
    }
  }
  await Promise.race([
    updateDoc(shiftRef(uid, shift.id), updates),
    new Promise<void>((res) => setTimeout(res, 300)),
  ])
}

/** "Add shift" — a fully manual historical shift; never touches the flag. */
export async function createManualShift(
  uid: string,
  shiftId: string,
  edit: { startMs: number; endMs: number; breaks: BreakEdit[] },
): Promise<void> {
  const breaks: Record<string, unknown> = {}
  for (const b of edit.breaks) {
    breaks[b.id] = { start: manualStamp(b.startMs), end: manualStamp(b.endMs) }
  }
  const payload = {
    start: manualStamp(edit.startMs),
    end: manualStamp(edit.endMs),
    stopClaims: {},
    breaks,
    deleted: false,
    deletedAtMs: null,
    createdAt: serverTimestamp(),
    ...meta(),
  }
  fireBatch((b) => b.set(shiftRef(uid, shiftId), payload))
}

/**
 * Quick-adjust chips (−5/−15/−30 min): one undoable manual edit to start.
 * Returns the previous resolved start so the snackbar can restore it.
 */
export async function adjustStart(
  uid: string,
  shift: Shift,
  deltaMs: number,
): Promise<{ previousStartMs: number }> {
  const previousStartMs = resolveMs(shift.start)
  await Promise.race([
    updateDoc(shiftRef(uid, shift.id), {
      start: manualStamp(previousStartMs + deltaMs),
      ...meta(),
    }),
    new Promise<void>((res) => setTimeout(res, 300)),
  ])
  return { previousStartMs }
}

export async function restoreStart(
  uid: string,
  shiftId: string,
  previousStartMs: number,
): Promise<void> {
  // The original srv Timestamp can't be reconstructed, but the resolved value
  // is what every consumer derives from — restoring it as manual is faithful.
  await Promise.race([
    updateDoc(shiftRef(uid, shiftId), {
      start: manualStamp(previousStartMs),
      ...meta(),
    }),
    new Promise<void>((res) => setTimeout(res, 300)),
  ])
}

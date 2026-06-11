/**
 * Core data types. Deliberately decoupled from the Firebase SDK: `ServerStamp`
 * is the structural shape of a Firestore Timestamp, so the pure libraries
 * (time, durations, reconcile, validate) and their node tests never import
 * firebase.
 */
export interface ServerStamp {
  toMillis(): number
}

/**
 * Dual timestamp on every boundary.
 * - `ms`: epoch ms captured synchronously in the tap handler (the truthful tap
 *   time even if the write syncs hours later). Offline-path writes store
 *   tapMs + clockOffsetMs.
 * - `srv`: serverTimestamp() on live taps. ALWAYS null after a manual edit —
 *   `srv == null` is the canonical "manually edited" marker (a manual end is
 *   authoritative; stopClaims are ignored on it).
 */
export type Stamp = {
  ms: number
  srv: ServerStamp | null
}

export type Break = {
  start: Stamp
  end: Stamp | null // null = break currently open
}

export type Shift = {
  id: string
  start: Stamp
  end: Stamp | null // null = no committed end
  /** First-stop-wins ledger for offline ends, keyed by deviceId. */
  stopClaims: Record<string, Stamp>
  /** Map keyed by breakId — never an array (array LWW destroys concurrent edits). */
  breaks: Record<string, Break>
  deleted: boolean // soft delete — free UNDO
  deletedAtMs: number | null
  createdAt: ServerStamp | null
  updatedAt: ServerStamp | null
  updatedBy: string // deviceId
  /** Set by the snapshot reader when this doc has unsynced local writes. */
  pendingWrite?: boolean
}

export type PeriodFilter = 'day' | 'week' | 'month' | 'custom'

/** App-level request to open the editor; the live shift doc is resolved by App. */
export type EditRequest = { kind: 'edit'; shiftId: string } | { kind: 'add' }

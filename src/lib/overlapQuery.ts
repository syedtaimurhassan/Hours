/**
 * Save-time overlap query — Firebase side of validate.ts, kept separate so
 * the pure rules stay importable in node tests.
 */
import { getDocs, orderBy, query, where } from 'firebase/firestore'
import type { Shift } from '../types'
import { docToShift } from './convert'
import { shiftsCol } from './shifts'
import { MAX_SHIFT_MS, SKEW_LIMIT_MS } from './time'
import { findOverlapIn, type OverlapHit } from './validate'

/**
 * Save-time overlap check. Window: because MAX_SHIFT_MS is a hard cap, no
 * committed shift can start before (editStart − MAX_SHIFT_MS − SKEW) yet
 * still reach into the edited interval. `openShifts` (the global open set,
 * already loaded) is always included regardless of its start. Block, never
 * auto-trim.
 */
export async function findOverlap(
  uid: string,
  draft: { startMs: number; endMs: number },
  excludeShiftId: string | null,
  openShifts: Shift[],
  nowMs: number,
): Promise<OverlapHit | null> {
  const q = query(
    shiftsCol(uid),
    where('start.ms', '>=', draft.startMs - MAX_SHIFT_MS - SKEW_LIMIT_MS),
    where('start.ms', '<', draft.endMs + SKEW_LIMIT_MS),
    orderBy('start.ms', 'asc'),
  )
  // getDocs serves from cache when the server is unreachable — the editor
  // still validates offline against everything this device knows.
  const snap = await getDocs(q)
  const fetched = snap.docs.map((d) =>
    docToShift(d.id, d.data({ serverTimestamps: 'estimate' })),
  )
  const byId = new Map(fetched.map((s) => [s.id, s]))
  for (const s of openShifts) if (!byId.has(s.id)) byId.set(s.id, s)
  return findOverlapIn([...byId.values()], draft, excludeShiftId, nowMs)
}

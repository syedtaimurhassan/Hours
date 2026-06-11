import type { DocumentData } from 'firebase/firestore'
import type { Break, ServerStamp, Shift, Stamp } from '../types'

/**
 * Defensive Firestore-doc → Shift conversion. Reads always use
 * { serverTimestamps: 'estimate' } so pending serverTimestamp() values render
 * as estimates instead of null (no NaN timers while a write is in flight).
 */
function toStamp(raw: unknown): Stamp {
  const r = (raw ?? {}) as { ms?: unknown; srv?: unknown }
  return {
    ms: typeof r.ms === 'number' && Number.isFinite(r.ms) ? r.ms : 0,
    srv:
      r.srv && typeof (r.srv as ServerStamp).toMillis === 'function'
        ? (r.srv as ServerStamp)
        : null,
  }
}

function toOptionalStamp(raw: unknown): Stamp | null {
  return raw === null || raw === undefined ? null : toStamp(raw)
}

export function docToShift(id: string, data: DocumentData): Shift {
  const breaks: Record<string, Break> = {}
  for (const [bid, b] of Object.entries(
    (data.breaks ?? {}) as Record<string, unknown>,
  )) {
    const br = (b ?? {}) as { start?: unknown; end?: unknown }
    breaks[bid] = { start: toStamp(br.start), end: toOptionalStamp(br.end) }
  }
  const stopClaims: Record<string, Stamp> = {}
  for (const [dev, c] of Object.entries(
    (data.stopClaims ?? {}) as Record<string, unknown>,
  )) {
    stopClaims[dev] = toStamp(c)
  }
  return {
    id,
    start: toStamp(data.start),
    end: toOptionalStamp(data.end),
    stopClaims,
    breaks,
    deleted: data.deleted === true,
    deletedAtMs: typeof data.deletedAtMs === 'number' ? data.deletedAtMs : null,
    createdAt: (data.createdAt as ServerStamp | undefined) ?? null,
    updatedAt: (data.updatedAt as ServerStamp | undefined) ?? null,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
  }
}

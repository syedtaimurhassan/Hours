import type { SnapMeta } from '../lib/useShifts'

/**
 * Driven solely by snapshot metadata (hasPendingWrites / fromCache) with
 * includeMetadataChanges — never navigator.onLine (lie-fi lies both ways).
 * The unsynced-loss window on a serverless static app is irreducible; this
 * badge keeps it visible (it can't go stale) and the tiny tap-time writes
 * keep it small.
 */
export function SyncBadge({ meta }: { meta: SnapMeta }) {
  if (meta.pendingCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
        <span aria-hidden>⏳</span>
        {meta.pendingCount} {meta.pendingCount === 1 ? 'change' : 'changes'} not
        yet synced
      </span>
    )
  }
  if (meta.fromCache) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
        <CloudOffIcon />
        offline
      </span>
    )
  }
  return null
}

function CloudOffIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 3l18 18M7.5 7.7A4.5 4.5 0 006.3 16.5H18M20.4 14.7A4 4 0 0017 9h-1.3A6 6 0 008.6 4.9" />
    </svg>
  )
}

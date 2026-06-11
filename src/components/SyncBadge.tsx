import type { SnapMeta } from '../lib/useShifts'

/**
 * Subtle sync indicator for the toolbar. Driven solely by snapshot metadata
 * (never navigator.onLine). Nothing renders when everything is synced.
 */
export function SyncBadge({ meta }: { meta: SnapMeta }) {
  if (meta.pendingCount > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[13px] font-medium text-amber-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        Syncing
      </span>
    )
  }
  if (meta.fromCache) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-fill px-3 py-1 text-[13px] font-medium text-secondary">
        <CloudOffIcon />
        Offline
      </span>
    )
  }
  return null
}

function CloudOffIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 3l18 18M7.5 7.7A4.5 4.5 0 006.3 16.5H18M20.4 14.7A4 4 0 0017 9h-1.3A6 6 0 008.6 4.9" />
    </svg>
  )
}

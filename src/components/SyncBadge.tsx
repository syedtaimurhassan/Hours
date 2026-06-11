import type { SnapMeta } from '../lib/useShifts'

/**
 * Connectivity/sync status as a thin full-width strip (the industry-standard
 * place for an offline indicator — e.g. a "No Internet" bar), shown only when
 * there's something to report. Driven solely by snapshot metadata, never
 * navigator.onLine.
 */
export function SyncStrip({ meta }: { meta: SnapMeta }) {
  if (meta.pendingCount > 0) {
    return (
      <div className="flex items-center justify-center gap-1.5 bg-amber-100 py-1 text-[12px] font-medium text-amber-800">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        Syncing {meta.pendingCount} {meta.pendingCount === 1 ? 'change' : 'changes'}…
      </div>
    )
  }
  if (meta.fromCache) {
    return (
      <div className="flex items-center justify-center gap-1.5 bg-[#e5e5ea] py-1 text-[12px] font-medium text-secondary">
        <CloudOffIcon />
        Offline · changes saved on this device
      </div>
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

export type BannerTone = 'info' | 'warn' | 'error'

export type BannerSpec = {
  id: string
  tone: BannerTone
  text: string
  actions?: { label: string; run: () => void }[]
  custom?: React.ReactNode
}

const toneClasses: Record<BannerTone, string> = {
  info: 'border-slate-200 bg-white text-slate-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-800',
}

/**
 * Single-banner policy: at most one visible, drawn from the priority queue in
 * App (repair dialog is modal and separate; snackbars are a separate
 * transient layer).
 */
export function Banner({ banner }: { banner: BannerSpec | null }) {
  if (!banner) return null
  if (banner.custom) return <div className="px-4 pt-3">{banner.custom}</div>
  return (
    <div className="px-4 pt-3">
      <div
        role={banner.tone === 'error' ? 'alert' : 'status'}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm ${toneClasses[banner.tone]}`}
      >
        <span className="min-w-0 flex-1">{banner.text}</span>
        {banner.actions?.map((a) => (
          <button
            key={a.label}
            type="button"
            className="shrink-0 font-semibold underline"
            onClick={a.run}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

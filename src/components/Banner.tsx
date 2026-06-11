export type BannerTone = 'info' | 'warn' | 'error'

export type BannerSpec = {
  id: string
  tone: BannerTone
  text: string
  actions?: { label: string; run: () => void }[]
  custom?: React.ReactNode
}

const toneClasses: Record<BannerTone, string> = {
  info: 'bg-card text-label',
  warn: 'bg-amber-50 text-amber-900',
  error: 'bg-red-50 text-red-700',
}

/**
 * Single-banner policy: at most one visible, drawn from App's priority queue.
 * Styled as an inset card to match the grouped dashboard.
 */
export function Banner({ banner }: { banner: BannerSpec | null }) {
  if (!banner) return null
  if (banner.custom) return <div className="mx-auto max-w-md px-4 pt-2">{banner.custom}</div>
  return (
    <div className="mx-auto max-w-md px-4 pt-2">
      <div
        role={banner.tone === 'error' ? 'alert' : 'status'}
        className={`card-shadow flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-[15px] ${toneClasses[banner.tone]}`}
      >
        <span className="min-w-0 flex-1">{banner.text}</span>
        {banner.actions?.map((a) => (
          <button
            key={a.label}
            type="button"
            className="shrink-0 text-[15px] font-semibold text-brand-deep"
            onClick={a.run}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

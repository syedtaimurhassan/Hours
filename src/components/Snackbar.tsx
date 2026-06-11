import { useEffect } from 'react'

export type Snack = {
  key: number
  message: string
  actions?: { label: string; run: () => void }[]
  /** ms; default 2 s. */
  ttl?: number
}

/** Transient layer, separate from banners; may coexist with one banner. */
export function SnackbarHost({
  snack,
  onDismiss,
}: {
  snack: Snack | null
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!snack) return
    const id = setTimeout(onDismiss, snack.ttl ?? 2000)
    return () => clearTimeout(id)
  }, [snack, onDismiss])

  if (!snack) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[88px] z-40 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl bg-[#1c1c1e]/95 py-2.5 pr-2 pl-4 text-[15px] text-white shadow-[0_8px_30px_-4px_rgb(0_0_0/0.4)] backdrop-blur-xl"
      >
        <span className="min-w-0 flex-1">{snack.message}</span>
        {snack.actions?.map((a) => (
          <button
            key={a.label}
            type="button"
            className="min-h-9 shrink-0 rounded-lg px-2.5 py-1 font-semibold text-[#34c759] active:bg-white/10"
            onClick={() => {
              a.run()
              onDismiss()
            }}
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-white/60 active:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

import { useEffect } from 'react'

export type Snack = {
  key: number
  message: string
  actions?: { label: string; run: () => void }[]
  /** ms; default 10 s — expired undo is never data loss, all stays editable. */
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
    const id = setTimeout(onDismiss, snack.ttl ?? 10_000)
    return () => clearTimeout(id)
  }, [snack, onDismiss])

  if (!snack) return null
  const twoActions = (snack.actions?.length ?? 0) >= 2
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[88px] z-40 flex justify-center px-4">
      <div
        role="status"
        className={`pointer-events-auto w-full max-w-md rounded-2xl bg-[#1c1c1e]/95 px-4 py-3 text-[15px] text-white shadow-[0_8px_30px_-4px_rgb(0_0_0/0.4)] backdrop-blur-xl ${
          twoActions ? 'flex flex-col gap-1.5' : 'flex items-center justify-between gap-3'
        }`}
      >
        <span className="min-w-0">{snack.message}</span>
        {snack.actions && snack.actions.length > 0 && (
          <div className={`flex shrink-0 items-center gap-1 ${twoActions ? 'justify-end' : ''}`}>
            {snack.actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className="min-h-9 shrink-0 rounded-lg px-3 py-1 font-semibold text-[#34c759] active:bg-white/10"
                onClick={() => {
                  a.run()
                  onDismiss()
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

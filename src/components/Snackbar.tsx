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
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
      >
        <span className="min-w-0">{snack.message}</span>
        {snack.actions?.map((a) => (
          <button
            key={a.label}
            type="button"
            className="shrink-0 rounded px-2 py-1 font-semibold tracking-wide text-emerald-300 uppercase active:bg-white/10"
            onClick={() => {
              a.run()
              onDismiss()
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

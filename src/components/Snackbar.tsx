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
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
      <div
        role="status"
        className={`pointer-events-auto w-full max-w-md rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg ${
          // With two actions, stack the action row below the message so the
          // message never squeezes to a sliver on a 320px phone.
          twoActions
            ? 'flex flex-col gap-2'
            : 'flex items-center justify-between gap-3'
        }`}
      >
        <span className="min-w-0">{snack.message}</span>
        {snack.actions && snack.actions.length > 0 && (
          <div
            className={`flex shrink-0 items-center gap-1 ${twoActions ? 'justify-end' : ''}`}
          >
            {snack.actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className="min-h-9 shrink-0 rounded px-3 py-1 font-semibold tracking-wide text-emerald-300 uppercase active:bg-white/10"
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

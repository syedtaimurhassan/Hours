/**
 * iOS has no install prompt — detect-and-instruct. Installing also exempts
 * the app from Safari's 7-day storage eviction, which is the real reason to
 * nudge. Sets the expectation of one more sign-in (separate storage
 * partition for installed apps).
 */
export function InstallCard({
  needsSafari,
  onDismiss,
}: {
  needsSafari: boolean
  onDismiss: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-xs">
      <span aria-hidden className="mt-0.5 text-lg">
        📲
      </span>
      <div className="min-w-0">
        {needsSafari ? (
          <p>
            <strong>Install this app:</strong> open this page in{' '}
            <strong>Safari</strong> to install it on your home screen.
          </p>
        ) : (
          <p>
            <strong>Install this app:</strong> tap <strong>Share&nbsp;□↑</strong>,
            then <strong>Add to Home Screen</strong>. Installed apps keep your
            data safe and work offline. You'll sign in once more inside the
            installed app.
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="ml-auto flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-slate-500 active:bg-slate-100"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  )
}

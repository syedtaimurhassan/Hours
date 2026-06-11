import { waitForPendingWrites } from 'firebase/firestore'
import { useState } from 'react'
import { db } from '../firebase'
import { doSignOut } from '../lib/useAuth'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import { useSheetBackButton } from '../lib/useSheetBackButton'

/** Settings sub-screen (gear, top-right — rare access). */
export function Settings({
  email,
  hasActiveShift,
  onBack,
}: {
  email: string
  hasActiveShift: boolean
  onBack: () => void
}) {
  const { canPromptInstall, promptInstall } = useInstallPrompt()
  const [signingOut, setSigningOut] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  useSheetBackButton(true, onBack)

  const signOut = async () => {
    if (signingOut) return
    if (
      hasActiveShift &&
      !window.confirm(
        'A shift is still running. It will keep running until you sign back in and stop it. Sign out anyway?',
      )
    ) {
      return
    }
    setSigningOut(true)
    setBlocked(null)
    try {
      // Never sign out with unsynced taps in the queue.
      const synced = await Promise.race([
        waitForPendingWrites(db).then(() => true),
        new Promise<false>((res) => setTimeout(() => res(false), 5000)),
      ])
      if (!synced) {
        setBlocked(
          'You have unsynced changes — connect to the internet before signing out.',
        )
        return
      }
      await doSignOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-50">
      <div className="safe-top mx-auto max-w-md px-4 pb-10">
        <header className="flex min-h-14 items-center gap-2">
          <button
            type="button"
            aria-label="Back"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-slate-500 active:bg-slate-100"
            onClick={onBack}
          >
            ‹
          </button>
          <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
        </header>

        <div className="mt-2 flex flex-col gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Signed in as</p>
            <p className="text-base font-semibold break-all text-slate-900">
              {email}
            </p>
          </div>

          {canPromptInstall && (
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-base font-medium text-emerald-700 active:bg-slate-100"
              onClick={promptInstall}
            >
              Install app
            </button>
          )}

          <button
            type="button"
            disabled={signingOut}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-base font-medium text-red-600 active:bg-red-50 disabled:opacity-50"
            onClick={() => void signOut()}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          {blocked && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {blocked}
            </p>
          )}

          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            <p className="font-medium text-slate-700">Hours</p>
            <p className="mt-1">
              Shifts are shown on the day they started. Times are Danish time
              (Europe/Copenhagen). Your data is stored in the cloud once the
              sync badge clears.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

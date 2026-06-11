import { useRef, useState } from 'react'
import {
  doRegister,
  doResetPassword,
  doSignIn,
  mapAuthError,
  type AuthError,
} from '../lib/useAuth'
import { isStandalone } from '../lib/useInstallPrompt'

type Mode = 'signin' | 'register'

/**
 * One card, two explicit tabs (no "smart" email-detection flow — impossible
 * under enumeration protection). Re-login is a designed-for recurring path
 * (iOS eviction, cleared data, install partition), so password-manager
 * autofill attributes matter disproportionately.
 */
export function Login({ sessionExpired }: { sessionExpired: boolean }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [resetSentTo, setResetSentTo] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || cooldown) return
    setSubmitting(true)
    setError(null)
    setResetSentTo(null)
    try {
      if (mode === 'signin') await doSignIn(email, password)
      else await doRegister(email, password)
      // onAuthStateChanged routes away.
    } catch (err) {
      const mapped = mapAuthError(err)
      setError(mapped)
      if (mapped.kind === 'too-many') {
        setCooldown(true)
        setTimeout(() => setCooldown(false), 30_000)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const sendReset = async () => {
    const target = email.trim().toLowerCase()
    if (!target) {
      setError({ kind: 'other', message: 'Enter your email first.' })
      emailRef.current?.focus()
      return
    }
    setError(null)
    try {
      await doResetPassword(target)
    } catch {
      // Same neutral message either way — no account enumeration.
    }
    setResetSentTo(target)
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
    setResetSentTo(null)
  }

  const registerTooShort = mode === 'register' && password.length < 6

  return (
    <div className="safe-top flex min-h-dvh flex-col items-center justify-center bg-grouped px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-bold text-label">
          Hours
        </h1>
        <p className="mb-6 text-center text-sm text-secondary">
          {sessionExpired
            ? 'Your session expired — please sign in again.'
            : isStandalone()
              ? 'Sign in to load your shifts.'
              : 'Track your work hours.'}
        </p>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-medium">
            {(['signin', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`min-h-10 rounded-lg ${
                  mode === m ? 'bg-white text-label shadow-xs' : 'text-secondary'
                }`}
                onClick={() => switchMode(m)}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-secondary">
                Email
              </span>
              <input
                ref={emailRef}
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                className="min-h-12 w-full rounded-lg border border-separator bg-white px-3 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-secondary">
                Password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={
                    mode === 'signin' ? 'current-password' : 'new-password'
                  }
                  enterKeyHint="go"
                  className="min-h-12 w-full rounded-lg border border-separator bg-white px-3 pr-14 text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-secondary"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {mode === 'register' && (
                <span className="mt-1 block text-xs text-secondary">
                  At least 6 characters
                </span>
              )}
            </label>

            {error && (
              <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error.message}
                {error.kind === 'credentials' && (
                  <span className="mt-1 block">
                    <button type="button" className="font-medium underline" onClick={() => void sendReset()}>
                      Forgot password?
                    </button>
                    {' · '}
                    <button type="button" className="font-medium underline" onClick={() => switchMode('register')}>
                      New here? Create account
                    </button>
                  </span>
                )}
                {error.kind === 'exists' && (
                  <span className="mt-1 block">
                    <button type="button" className="font-medium underline" onClick={() => switchMode('signin')}>
                      Sign in instead
                    </button>
                  </span>
                )}
              </div>
            )}

            {resetSentTo && (
              <div role="status" className="rounded-lg bg-card px-3 py-2 text-sm text-brand-deep">
                If an account exists for <strong>{resetSentTo}</strong>, a reset
                link has been sent. Check your spam folder.{' '}
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => {
                    setResetSentTo(null)
                    emailRef.current?.focus()
                  }}
                >
                  Edit &amp; resend
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || cooldown || registerTooShort}
              className="mt-1 flex min-h-12 items-center justify-center rounded-xl bg-brand text-base font-semibold text-white disabled:opacity-40"
            >
              {submitting ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : mode === 'signin' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </button>

            {mode === 'signin' && !error && (
              <button
                type="button"
                className="text-sm font-medium text-secondary underline"
                onClick={() => void sendReset()}
              >
                Forgot password?
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

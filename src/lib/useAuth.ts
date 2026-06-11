import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'
import { auth, isConfigured } from '../firebase'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; sessionExpired: boolean }
  | { status: 'signedIn'; user: User }

export type AuthErrorKind =
  | 'credentials' // wrong email/password — show Forgot? + Create account hints
  | 'exists' // email already registered — offer Sign in instead
  | 'weak'
  | 'too-many' // disable submit for 30 s
  | 'offline'
  | 'config' // project/setup problem, not the user's fault
  | 'other'

export type AuthError = { kind: AuthErrorKind; message: string }

export function mapAuthError(err: unknown): AuthError {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return { kind: 'credentials', message: 'Incorrect email or password.' }
    case 'auth/email-already-in-use':
      return { kind: 'exists', message: 'This email already has an account.' }
    case 'auth/weak-password':
      return {
        kind: 'weak',
        message: 'Password is too weak — use at least 6 characters.',
      }
    case 'auth/too-many-requests':
      return {
        kind: 'too-many',
        message: 'Too many attempts. Wait a few minutes or reset your password.',
      }
    case 'auth/network-request-failed':
      return {
        kind: 'offline',
        message:
          "You're offline — connect to the internet to sign in for the first time.",
      }
    case 'auth/invalid-api-key':
    case 'auth/operation-not-allowed':
    case 'auth/app-deleted':
    case 'auth/project-not-found':
      return {
        kind: 'config',
        message: 'App configuration error — this is a setup problem, not your fault.',
      }
    default:
      return { kind: 'other', message: 'Sign-in failed, please try again.' }
  }
}

/** True while an explicit sign-out is in flight, so the signedOut transition
 * isn't misread as an expired session. */
let explicitSignOut = false

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const wasSignedIn = useRef(false)

  useEffect(() => {
    // No real Firebase project configured — App renders <ConfigError/>; don't
    // attach a listener to the dummy app.
    if (!isConfigured) return
    return onAuthStateChanged(auth, (user) => {
        if (user) {
          wasSignedIn.current = true
          explicitSignOut = false
          // Reduces storage eviction on Android; iOS mostly ignores it.
          void navigator.storage?.persist?.().catch(() => {})
          setState({ status: 'signedIn', user })
        } else {
          // A signedIn→signedOut transition without explicit sign-out is a
          // NAVIGATION EVENT ONLY (route to login with the expired message) —
          // never a cleanup trigger; re-login restores everything.
          setState({
            status: 'signedOut',
            sessionExpired: wasSignedIn.current && !explicitSignOut,
          })
        }
    })
  }, [])
  return state
}

export async function doSignIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
}

export async function doRegister(email: string, password: string): Promise<void> {
  await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
}

export async function doResetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase())
}

export async function doSignOut(): Promise<void> {
  explicitSignOut = true
  await signOut(auth)
}

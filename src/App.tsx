import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, type BannerSpec } from './components/Banner'
import { BottomNav, type Tab } from './components/BottomNav'
import {
  EditShiftSheet,
  type EditTarget,
} from './components/EditShiftSheet'
import { InstallCard } from './components/InstallCard'
import { RepairDialog } from './components/RepairDialog'
import { SnackbarHost, type Snack } from './components/Snackbar'
import { SyncBadge } from './components/SyncBadge'
import { isConfigured } from './firebase'
import { getClockOffsetMs, subscribeClockOffset } from './lib/clock'
import { effectiveEndMs } from './lib/durations'
import { saveShiftEdit, undoDelete } from './lib/shifts'
import {
  dayKey,
  formatDate,
  formatDuration,
  formatTime,
  resolveMs,
} from './lib/time'
import { useAuth } from './lib/useAuth'
import { useInstallPrompt } from './lib/useInstallPrompt'
import { useJobs } from './lib/useJobs'
import { useNow } from './lib/useNow'
import { usePrefs } from './lib/usePrefs'
import { usePWAUpdate } from './lib/usePWAUpdate'
import { useActiveFlag, useReconcile } from './lib/useReconcile'
import { useOpenShifts, useShiftDoc, useSyncError } from './lib/useShifts'
import { History } from './screens/History'
import { Login } from './screens/Login'
import { Main } from './screens/Main'
import { Settings } from './screens/Settings'
import type { EditRequest, Shift } from './types'

const FORGOT_HOURS_TO_MS = 3_600_000

export default function App() {
  const auth = useAuth()
  // Register the service worker ONCE here — App mounts exactly once regardless
  // of auth state, so SW listeners never stack on sign-in/out and precaching
  // starts on first visit (before login).
  const pwa = usePWAUpdate()

  useEffect(() => {
    // Reaching render means the entry chunk loaded — clear the reload-loop
    // guard so a future genuine update can still recover once.
    try {
      sessionStorage.removeItem('hours.preloadReloaded')
    } catch {
      /* private browsing */
    }
  }, [])

  if (!isConfigured) return <ConfigError />
  if (auth.status === 'loading') return <Splash />
  if (auth.status === 'signedOut') {
    return <Login sessionExpired={auth.sessionExpired} />
  }
  return (
    <Shell
      uid={auth.user.uid}
      email={auth.user.email ?? 'unknown account'}
      pwa={pwa}
    />
  )
}

function Shell({
  uid,
  email,
  pwa,
}: {
  uid: string
  email: string
  pwa: { updateReady: boolean; applyUpdate: () => void }
}) {
  const [tab, setTab] = useState<Tab>('track')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null)
  const [snack, setSnack] = useState<Snack | null>(null)
  const [installDismissed, setInstallDismissed] = useState(
    () => readFlag('hours.installCardDismissed'),
  )
  const [clockNoteDismissed, setClockNoteDismissed] = useState(false)
  const [privateDismissed, setPrivateDismissed] = useState(false)
  // Per-shift session dismissal of the forgot-to-end banner.
  const [forgotDismissedId, setForgotDismissedId] = useState<string | null>(null)
  const privateMode = usePrivateModeProbe()

  const { openShifts, candidates, meta: openMeta } = useOpenShifts(uid)
  const observedActiveId = useActiveFlag(uid)
  const flags = useReconcile(uid, candidates, observedActiveId)
  const syncError = useSyncError(uid)
  const { jobs, byId: jobsById } = useJobs(uid)
  const prefs = usePrefs()
  const { updateReady, applyUpdate } = pwa
  const install = useInstallPrompt()
  const clockOffset = useClockOffset()
  const active = openShifts[0] ?? null
  // Tick whenever a shift is running OR a sheet that validates against "now"
  // is open — otherwise an idle editor would block "ends now" as future.
  const now = useNow(active !== null || editRequest !== null || settingsOpen)

  const showSnack = useCallback((s: Omit<Snack, 'key'>) => {
    setSnack({ ...s, key: Date.now() })
  }, [])

  // Resolve the edit request against the live document — sheets never edit a
  // stale snapshot captured at tap time.
  const editingId = editRequest?.kind === 'edit' ? editRequest.shiftId : null
  const editingShift = useShiftDoc(uid, editingId)
  useEffect(() => {
    if (editingId && editingShift === null) {
      // Deleted remotely while the sheet was open.
      setEditRequest(null)
    }
  }, [editingId, editingShift])

  const editTarget: EditTarget | null = useMemo(() => {
    if (!editRequest) return null
    if (editRequest.kind === 'add') return { kind: 'add' }
    if (!editingShift) return null // still loading
    return {
      kind: 'edit',
      shift: editingShift,
      isActive: effectiveEndMs(editingShift) === null && !editingShift.deleted,
    }
  }, [editRequest, editingShift])

  // Effective forgot-to-end threshold from prefs (0 h = the reminder is off).
  const forgotThresholdMs = prefs.forgotThresholdH * FORGOT_HOURS_TO_MS

  // ----- Single-banner priority queue -----
  const banner: BannerSpec | null = useMemo(() => {
    if (active && forgotThresholdMs > 0 && forgotDismissedId !== active.id) {
      const startMs = resolveMs(active.start)
      if (now - startMs > forgotThresholdMs) {
        const startedToday = dayKey(startMs) === dayKey(now)
        return {
          id: 'forgot',
          tone: 'warn',
          text: `Still working? This shift started ${
            startedToday ? 'today' : `on ${formatDate(startMs)}`
          } at ${formatTime(startMs)} (${formatDuration(now - startMs)} ago).`,
          actions: [
            {
              label: 'Fix times',
              run: () => setEditRequest({ kind: 'edit', shiftId: active.id }),
            },
            { label: 'Dismiss', run: () => setForgotDismissedId(active.id) },
          ],
        }
      }
    }
    if (syncError) {
      return { id: 'syncError', tone: 'error', text: syncError }
    }
    if (updateReady) {
      return {
        id: 'update',
        tone: 'info',
        text: 'Update available.',
        actions: [{ label: 'Reload', run: applyUpdate }],
      }
    }
    if (prefs.showClockWarning && !clockNoteDismissed && Math.abs(clockOffset) > 2 * 60_000) {
      return {
        id: 'clock',
        tone: 'info',
        text: 'Your device clock looks off — recorded times are corrected automatically.',
        actions: [{ label: 'OK', run: () => setClockNoteDismissed(true) }],
      }
    }
    if (privateMode && !privateDismissed) {
      return {
        id: 'private',
        tone: 'info',
        text: "Private browsing detected — you'll need to sign in each time, and offline use is limited.",
        actions: [{ label: 'OK', run: () => setPrivateDismissed(true) }],
      }
    }
    if (install.showIOSInstallCard && prefs.showInstallHint && !installDismissed && tab === 'track') {
      return {
        id: 'install',
        tone: 'info',
        text: '',
        custom: (
          <InstallCard
            needsSafari={install.iosNeedsSafari}
            onDismiss={() => {
              setInstallDismissed(true)
              writeFlag('hours.installCardDismissed')
            }}
          />
        ),
      }
    }
    return null
  }, [
    active,
    now,
    forgotThresholdMs,
    forgotDismissedId,
    syncError,
    updateReady,
    applyUpdate,
    prefs.showClockWarning,
    prefs.showInstallHint,
    clockNoteDismissed,
    clockOffset,
    privateMode,
    privateDismissed,
    install.showIOSInstallCard,
    install.iosNeedsSafari,
    installDismissed,
    tab,
  ])

  // Rule 1 repair: mandatory, modal, above everything.
  const multipleOpen: Shift[] = useMemo(
    () =>
      flags.multipleOpenIds
        .map((id) => candidates.find((s) => s.id === id))
        .filter((s): s is Shift => s !== undefined),
    [flags.multipleOpenIds, candidates],
  )

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="safe-top sticky top-0 z-20 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-md items-center gap-3 px-4">
          <h1 className="text-lg font-bold text-slate-900">Hours</h1>
          <SyncBadge meta={openMeta} />
          <button
            type="button"
            aria-label="Settings"
            className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 active:bg-slate-200"
            onClick={() => setSettingsOpen(true)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.2a1.7 1.7 0 001 1.5h.1a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1h.2a2 2 0 110 4h-.2a1.7 1.7 0 00-1.5 1z" />
            </svg>
          </button>
        </div>
      </header>

      <Banner banner={banner} />

      <main>
        {tab === 'track' ? (
          <Main
            uid={uid}
            openShifts={openShifts}
            openMeta={openMeta}
            flags={flags}
            jobs={jobs}
            jobsById={jobsById}
            forgotThresholdMs={forgotThresholdMs}
            onEdit={setEditRequest}
            onManageJobs={() => setSettingsOpen(true)}
            showSnack={showSnack}
          />
        ) : (
          <History
            uid={uid}
            candidates={candidates}
            observedActiveId={observedActiveId}
            jobs={jobs}
            jobsById={jobsById}
            onEdit={setEditRequest}
          />
        )}
      </main>

      <BottomNav tab={tab} onChange={setTab} />

      {settingsOpen && (
        <Settings
          uid={uid}
          email={email}
          hasActiveShift={active !== null}
          jobs={jobs}
          onBack={() => setSettingsOpen(false)}
        />
      )}

      {editTarget && (
        <EditShiftSheet
          uid={uid}
          target={editTarget}
          nowMs={now}
          openShifts={openShifts}
          jobs={jobs}
          onClose={() => setEditRequest(null)}
          onSaved={(notice) =>
            showSnack({ message: notice ?? 'Saved', ttl: notice ? 8000 : 4000 })
          }
          onDeleted={(shift) =>
            showSnack({
              message: 'Shift deleted',
              actions: [
                {
                  label: 'UNDO',
                  run: () => void undoDelete(uid, shift.id),
                },
              ],
            })
          }
          onOpenShift={(shiftId) => setEditRequest({ kind: 'edit', shiftId })}
        />
      )}

      {multipleOpen.length >= 2 && !editTarget && (
        <RepairDialog
          shifts={multipleOpen}
          onResolve={(earliest, endMs) => {
            void saveShiftEdit(uid, earliest, {
              startMs: resolveMs(earliest.start),
              end: endMs,
              breaks: Object.entries(earliest.breaks)
                .map(([id, b]) => ({
                  id,
                  startMs: resolveMs(b.start),
                  endMs: b.end ? Math.min(resolveMs(b.end), endMs) : endMs,
                }))
                .filter((b) => b.startMs < endMs && b.endMs > b.startMs),
            }).then(() => showSnack({ message: 'Overlap fixed' }))
          }}
        />
      )}

      <SnackbarHost snack={snack} onDismiss={() => setSnack(null)} />
    </div>
  )
}

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50">
      <span className="text-3xl font-bold text-slate-900">Hours</span>
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" />
    </div>
  )
}

function ConfigError() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="max-w-sm text-center">
        <p className="text-4xl">🔧</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">
          App configuration error
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          This is a setup problem, not your fault. The Firebase config in{' '}
          <code className="rounded bg-slate-200 px-1">src/firebase.ts</code>{' '}
          still has placeholder values.
        </p>
      </div>
    </div>
  )
}

/** Reactive clock offset — the banner appears as soon as it's measured. */
function useClockOffset(): number {
  const [offset, setOffset] = useState(() => getClockOffsetMs())
  useEffect(() => subscribeClockOffset(() => setOffset(getClockOffsetMs())), [])
  return offset
}

/** IndexedDB probe — Firestore falls back to memory cache in private mode. */
function usePrivateModeProbe(): boolean {
  const [privateMode, setPrivateMode] = useState(false)
  useEffect(() => {
    try {
      const req = indexedDB.open('hours-probe')
      req.onerror = () => setPrivateMode(true)
      req.onsuccess = () => {
        req.result.close()
        indexedDB.deleteDatabase('hours-probe')
      }
    } catch {
      setPrivateMode(true)
    }
  }, [])
  return privateMode
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* private browsing */
  }
}

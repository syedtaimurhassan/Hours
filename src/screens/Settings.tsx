import { waitForPendingWrites } from 'firebase/firestore'
import { useState } from 'react'
import { db } from '../firebase'
import {
  JOB_COLORS,
  archiveJob,
  createJob,
  swatch,
  unarchiveJob,
  updateJob,
  type JobColor,
} from '../lib/jobs'
import { doSignOut } from '../lib/useAuth'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import { setPref, usePrefs } from '../lib/usePrefs'
import { useSheetBackButton } from '../lib/useSheetBackButton'
import type { Job } from '../types'

/** Settings sub-screen (gear, top-right). */
export function Settings({
  uid,
  email,
  hasActiveShift,
  jobs,
  onBack,
}: {
  uid: string
  email: string
  hasActiveShift: boolean
  jobs: Job[]
  onBack: () => void
}) {
  const { canPromptInstall, promptInstall } = useInstallPrompt()
  const prefs = usePrefs()
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
      <div className="safe-top mx-auto max-w-md px-4 pb-12">
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

        <div className="mt-2 flex flex-col gap-6">
          {/* Account */}
          <Section title="Account">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">Signed in as</p>
              <p className="text-base font-semibold break-all text-slate-900">
                {email}
              </p>
            </div>
          </Section>

          {/* Jobs */}
          <Section title="Jobs" subtitle="Track separate workplaces and see per-job totals.">
            <JobsManager uid={uid} jobs={jobs} />
          </Section>

          {/* Reminders & tips — the controls for "popups that won't go away" */}
          <Section title="Reminders & tips">
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <Row label="Install hint" desc="Show the Add-to-Home-Screen card">
                <Toggle
                  on={prefs.showInstallHint}
                  onChange={(v) => setPref('showInstallHint', v)}
                />
              </Row>
              <Row
                label="Forgot-to-end reminder"
                desc="Warn and offer recovery for a long-running shift"
              >
                <Segmented
                  value={String(prefs.forgotThresholdH)}
                  options={[
                    { value: '0', label: 'Off' },
                    { value: '8', label: '8h' },
                    { value: '12', label: '12h' },
                    { value: '16', label: '16h' },
                  ]}
                  onChange={(v) =>
                    setPref('forgotThresholdH', Number(v) as 0 | 8 | 12 | 16)
                  }
                />
              </Row>
              <Row label="Clock warning" desc="Note when the device clock looks off">
                <Toggle
                  on={prefs.showClockWarning}
                  onChange={(v) => setPref('showClockWarning', v)}
                />
              </Row>
            </div>
          </Section>

          {/* App */}
          <Section title="App">
            <div className="flex flex-col gap-3">
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
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                <p className="font-medium text-slate-700">Hours v{__APP_VERSION__}</p>
                <p className="mt-1">
                  Shifts are shown on the day they started. Times are Danish time
                  (Europe/Copenhagen). Your data is stored in the cloud once the
                  sync badge clears.
                </p>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h2>
      {subtitle && <p className="mb-2 -mt-1 text-sm text-slate-500">{subtitle}</p>}
      {children}
    </section>
  )
}

function Row({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-base font-medium text-slate-800">{label}</p>
        {desc && <p className="text-xs text-slate-500">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-md px-2.5 text-sm font-medium ${
            value === o.value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function JobsManager({ uid, jobs }: { uid: string; jobs: Job[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const active = jobs.filter((j) => !j.archived)
  const archived = jobs.filter((j) => j.archived)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {active.length === 0 && !adding && (
        <p className="px-4 py-3 text-sm text-slate-500">No jobs yet.</p>
      )}
      <div className="divide-y divide-slate-100">
        {active.map((job) =>
          editing === job.id ? (
            <JobForm
              key={job.id}
              initial={job}
              onCancel={() => setEditing(null)}
              onSave={async (name, color) => {
                await updateJob(uid, job.id, { name, color })
                setEditing(null)
              }}
              onArchive={async () => {
                await archiveJob(uid, job.id)
                setEditing(null)
              }}
            />
          ) : (
            <button
              key={job.id}
              type="button"
              onClick={() => setEditing(job.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
            >
              <span className={`h-3.5 w-3.5 rounded-full ${swatch(job.color).dot}`} />
              <span className="flex-1 text-base font-medium text-slate-800">
                {job.name}
              </span>
              <span className="text-sm text-slate-400">Edit</span>
            </button>
          ),
        )}
        {adding && (
          <JobForm
            onCancel={() => setAdding(false)}
            onSave={async (name, color) => {
              await createJob(uid, name, color, jobs.length)
              setAdding(false)
            }}
          />
        )}
      </div>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full min-h-11 items-center gap-2 px-4 py-3 text-left text-base font-medium text-emerald-700 active:bg-slate-50"
        >
          + Add job
        </button>
      )}

      {archived.length > 0 && (
        <div className="border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="flex w-full min-h-11 items-center px-4 py-2.5 text-sm text-slate-500"
          >
            {showArchived ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {showArchived &&
            archived.map((job) => (
              <div key={job.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`h-3 w-3 rounded-full ${swatch(job.color).dot} opacity-50`} />
                <span className="flex-1 text-sm text-slate-500 line-through">
                  {job.name}
                </span>
                <button
                  type="button"
                  className="min-h-9 text-sm font-medium text-emerald-700"
                  onClick={() => void unarchiveJob(uid, job.id)}
                >
                  Restore
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function JobForm({
  initial,
  onSave,
  onCancel,
  onArchive,
}: {
  initial?: Job
  onSave: (name: string, color: JobColor) => Promise<void>
  onCancel: () => void
  onArchive?: () => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState<JobColor>(
    (initial?.color as JobColor) ?? JOB_COLORS[0],
  )
  const [saving, setSaving] = useState(false)
  const canSave = name.trim().length > 0 && !saving

  return (
    <div className="bg-slate-50 px-4 py-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Job name (e.g. Café)"
        maxLength={40}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {JOB_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => setColor(c)}
            className={`h-8 w-8 rounded-full ${swatch(c).dot} ${
              color === c ? 'ring-2 ring-slate-900 ring-offset-2' : ''
            }`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!canSave}
          className="min-h-10 flex-1 rounded-lg bg-emerald-600 text-sm font-semibold text-white disabled:opacity-40"
          onClick={async () => {
            setSaving(true)
            try {
              await onSave(name.trim(), color)
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-500"
          onClick={onCancel}
        >
          Cancel
        </button>
        {onArchive && (
          <button
            type="button"
            className="min-h-10 rounded-lg px-3 text-sm font-medium text-red-600"
            onClick={() => void onArchive()}
          >
            Archive
          </button>
        )}
      </div>
    </div>
  )
}

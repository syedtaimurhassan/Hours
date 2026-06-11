import {
  collection,
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Job } from '../types'
import { getDeviceId } from './deviceId'

/** Fixed palette — a job stores the key; UI maps key → Tailwind classes. */
export const JOB_COLORS = [
  'emerald',
  'blue',
  'violet',
  'amber',
  'rose',
  'teal',
  'orange',
  'cyan',
  'pink',
  'lime',
] as const
export type JobColor = (typeof JOB_COLORS)[number]

type Swatch = { dot: string; soft: string; softText: string; bar: string; ring: string }

const SWATCHES: Record<string, Swatch> = {
  emerald: { dot: 'bg-emerald-500', soft: 'bg-emerald-50', softText: 'text-emerald-700', bar: 'bg-emerald-500', ring: 'ring-emerald-500' },
  blue: { dot: 'bg-blue-500', soft: 'bg-blue-50', softText: 'text-blue-700', bar: 'bg-blue-500', ring: 'ring-blue-500' },
  violet: { dot: 'bg-violet-500', soft: 'bg-violet-50', softText: 'text-violet-700', bar: 'bg-violet-500', ring: 'ring-violet-500' },
  amber: { dot: 'bg-amber-500', soft: 'bg-amber-50', softText: 'text-amber-700', bar: 'bg-amber-500', ring: 'ring-amber-500' },
  rose: { dot: 'bg-rose-500', soft: 'bg-rose-50', softText: 'text-rose-700', bar: 'bg-rose-500', ring: 'ring-rose-500' },
  teal: { dot: 'bg-teal-500', soft: 'bg-teal-50', softText: 'text-teal-700', bar: 'bg-teal-500', ring: 'ring-teal-500' },
  orange: { dot: 'bg-orange-500', soft: 'bg-orange-50', softText: 'text-orange-700', bar: 'bg-orange-500', ring: 'ring-orange-500' },
  cyan: { dot: 'bg-cyan-500', soft: 'bg-cyan-50', softText: 'text-cyan-700', bar: 'bg-cyan-500', ring: 'ring-cyan-500' },
  pink: { dot: 'bg-pink-500', soft: 'bg-pink-50', softText: 'text-pink-700', bar: 'bg-pink-500', ring: 'ring-pink-500' },
  lime: { dot: 'bg-lime-500', soft: 'bg-lime-50', softText: 'text-lime-700', bar: 'bg-lime-500', ring: 'ring-lime-500' },
}

const FALLBACK: Swatch = { dot: 'bg-slate-400', soft: 'bg-slate-100', softText: 'text-slate-600', bar: 'bg-slate-400', ring: 'ring-slate-400' }

export function swatch(color: string | undefined): Swatch {
  return (color && SWATCHES[color]) || FALLBACK
}

export const jobsCol = (uid: string) => collection(db, 'users', uid, 'jobs')
export const jobRef = (uid: string, id: string) => doc(db, 'users', uid, 'jobs', id)

const meta = () => ({ updatedAt: serverTimestamp(), updatedBy: getDeviceId() })

export async function createJob(
  uid: string,
  name: string,
  color: JobColor,
  order: number,
): Promise<string> {
  const id = crypto.randomUUID()
  const b = writeBatch(db)
  b.set(jobRef(uid, id), {
    name: name.trim(),
    color,
    archived: false,
    order,
    createdAt: serverTimestamp(),
    ...meta(),
  })
  await b.commit().catch(() => {}) // optimistic; local cache applies instantly
  return id
}

export async function updateJob(
  uid: string,
  id: string,
  patch: Partial<Pick<Job, 'name' | 'color' | 'order' | 'archived'>>,
): Promise<void> {
  await Promise.race([
    updateDoc(jobRef(uid, id), { ...patch, ...meta() }),
    new Promise<void>((res) => setTimeout(res, 300)),
  ])
}

/**
 * Archive (soft-hide) a job — never hard-delete, so historical shifts keep a
 * resolvable name/color. Archived jobs drop out of the picker.
 */
export async function archiveJob(uid: string, id: string): Promise<void> {
  await updateJob(uid, id, { archived: true })
}

export async function unarchiveJob(uid: string, id: string): Promise<void> {
  await updateJob(uid, id, { archived: false })
}

/** Detach the field entirely from a shift (set "no job"). */
export async function clearShiftJob(uid: string, shiftId: string): Promise<void> {
  await Promise.race([
    updateDoc(doc(db, 'users', uid, 'shifts', shiftId), {
      jobId: deleteField(),
      ...meta(),
    }),
    new Promise<void>((res) => setTimeout(res, 300)),
  ])
}

/** Last-used job id for one-tap start (per device). */
const LAST_JOB_KEY = 'hours.lastJobId'
export function getLastJobId(): string | null {
  try {
    return localStorage.getItem(LAST_JOB_KEY)
  } catch {
    return null
  }
}
export function setLastJobId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_JOB_KEY, id)
    else localStorage.removeItem(LAST_JOB_KEY)
  } catch {
    /* private browsing */
  }
}

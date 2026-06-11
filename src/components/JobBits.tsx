import { swatch } from '../lib/jobs'
import type { Job } from '../types'

/** Small color dot for a job. */
export function JobDot({ color, className = '' }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${swatch(color).dot} ${className}`}
    />
  )
}

/** Job chip: dot + name in the job's soft color. */
export function JobChip({ job }: { job: Job }) {
  const s = swatch(job.color)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.soft} ${s.softText}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {job.name}
    </span>
  )
}

/**
 * Horizontal job selector (chips) — used on Track to choose the workplace for
 * the next shift, and in the editor. Includes a "No job" option.
 */
export function JobSelector({
  jobs,
  selectedId,
  onSelect,
  allowNone = true,
  onManage,
}: {
  jobs: Job[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  allowNone?: boolean
  onManage?: () => void
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {allowNone && (
        <Chip
          active={selectedId === null}
          onClick={() => onSelect(null)}
          label="No job"
          dotClass="bg-slate-300"
        />
      )}
      {jobs.map((j) => (
        <Chip
          key={j.id}
          active={selectedId === j.id}
          onClick={() => onSelect(j.id)}
          label={j.name}
          dotClass={swatch(j.color).dot}
        />
      ))}
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 text-sm font-medium text-slate-500 active:bg-slate-100"
        >
          + Job
        </button>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  label,
  dotClass,
}: {
  active: boolean
  onClick: () => void
  label: string
  dotClass: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-300 bg-white text-slate-600'
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      {label}
    </button>
  )
}

import {
  formatDateTime,
  parseDateInput,
  parseTimeInput,
  wallToEpoch,
} from '../lib/time'
import { TimeField } from './TimeField'

export type DateTimeDraft = { date: string; time: string } // raw input values

export function draftToMs(d: DateTimeDraft): number | null {
  const date = parseDateInput(d.date)
  const time = parseTimeInput(d.time)
  if (!date || !time) return null
  return wallToEpoch(date.y, date.m, date.d, time.hh, time.mm)
}

/**
 * Paired native date + time inputs — on iOS/Android these invoke the native
 * wheel pickers (the friendly entry the user asked for; split inputs beat
 * datetime-local on both platforms). The confirmation readout always shows
 * the app's own format, including the DST-resolved time for inputs that the
 * platform normalized.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  error,
  dateMax,
}: {
  label: string
  value: DateTimeDraft
  onChange: (v: DateTimeDraft, field: 'date' | 'time') => void
  error?: string | undefined
  dateMax?: string | undefined
}) {
  const ms = draftToMs(value)
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold tracking-wide text-secondary uppercase">
        {label}
      </span>
      <div className="flex gap-2">
        <input
          type="date"
          aria-label={`${label} date`}
          className={inputClass(Boolean(error))}
          value={value.date}
          max={dateMax}
          onChange={(e) => onChange({ ...value, date: e.target.value }, 'date')}
        />
        <TimeField
          ariaLabel={`${label} time`}
          value={value.time}
          invalid={Boolean(error)}
          onChange={(t) => onChange({ ...value, time: t }, 'time')}
        />
      </div>
      {error ? (
        <p className="mt-1 text-[13px] text-red-600">{error}</p>
      ) : (
        ms !== null && (
          <p className="mt-1 text-[13px] text-secondary">{formatDateTime(ms)}</p>
        )
      )}
    </div>
  )
}

function inputClass(invalid: boolean): string {
  return `min-h-12 flex-1 rounded-xl border bg-card px-3.5 text-[17px] text-label ${
    invalid ? 'border-red-400' : 'border-separator'
  }`
}

import { useEffect, useRef, useState } from 'react'
import { parseTimeInput } from '../lib/time'
import { useSheetBackButton } from '../lib/useSheetBackButton'

const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const ITEM_H = 40

/**
 * A time field that opens an Apple-style wheel picker on tap — replacing the
 * native <input type="time"> (which renders a 12-hour AM/PM spinner on desktop
 * and is inconsistent with the app's 24-hour format). The date field keeps the
 * native calendar widget; this gives time the same "tap → widget" feel.
 */
export function TimeField({
  value,
  onChange,
  invalid,
  ariaLabel,
}: {
  value: string // "HH:mm" or ""
  onChange: (hhmm: string) => void
  invalid?: boolean
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        className={`flex min-h-12 flex-1 items-center justify-between rounded-xl border bg-card px-3.5 text-[17px] ${
          invalid ? 'border-red-400' : 'border-separator'
        }`}
      >
        <span className={`tabular-digits ${value ? 'text-label' : 'text-tertiary'}`}>
          {value || '––:––'}
        </span>
        <ClockIcon />
      </button>
      {open && (
        <TimeWheelSheet
          value={value}
          onCancel={() => setOpen(false)}
          onSet={(v) => {
            onChange(v)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function TimeWheelSheet({
  value,
  onSet,
  onCancel,
}: {
  value: string
  onSet: (hhmm: string) => void
  onCancel: () => void
}) {
  const init = parseTimeInput(value) ?? { hh: 9, mm: 0 }
  const hh = useRef(init.hh)
  const mm = useRef(init.mm)
  useSheetBackButton(true, onCancel)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-black/30"
        onClick={onCancel}
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet-enter safe-bottom relative w-full max-w-md rounded-t-[20px] bg-grouped px-4 pt-2.5 pb-6 shadow-[0_-8px_40px_-8px_rgb(0_0_0/0.3)]"
      >
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            className="min-h-11 text-[17px] text-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <span className="text-[15px] font-semibold text-label">Select time</span>
          <button
            type="button"
            className="min-h-11 text-[17px] font-semibold text-brand-deep"
            onClick={() => onSet(`${pad(hh.current)}:${pad(mm.current)}`)}
          >
            Set
          </button>
        </div>

        <div className="relative mx-auto flex max-w-[240px] items-stretch justify-center">
          {/* center selection band */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-fill"
          />
          <Wheel values={HOURS} initial={init.hh} onSettle={(v) => (hh.current = v)} />
          <span className="flex items-center px-1 text-[24px] font-semibold text-label">:</span>
          <Wheel values={MINUTES} initial={init.mm} onSettle={(v) => (mm.current = v)} />
        </div>
      </div>
    </div>
  )
}

function Wheel({
  values,
  initial,
  onSettle,
}: {
  values: number[]
  initial: number
  onSettle: (v: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [centerIdx, setCenterIdx] = useState(Math.max(0, values.indexOf(initial)))

  useEffect(() => {
    const idx = Math.max(0, values.indexOf(initial))
    if (ref.current) ref.current.scrollTop = idx * ITEM_H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    const idx = Math.round((ref.current?.scrollTop ?? 0) / ITEM_H)
    const clamped = Math.max(0, Math.min(values.length - 1, idx))
    setCenterIdx(clamped)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onSettle(values[clamped]), 90)
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="no-scrollbar h-[200px] w-[72px] overflow-y-scroll overscroll-contain"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      <div style={{ height: ITEM_H * 2 }} />
      {values.map((v, i) => (
        <div
          key={v}
          onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })}
          className={`flex h-10 items-center justify-center text-[22px] tabular-digits transition-colors ${
            i === centerIdx ? 'font-semibold text-label' : 'text-tertiary'
          }`}
          style={{ scrollSnapAlign: 'center' }}
        >
          {pad(v)}
        </div>
      ))}
      <div style={{ height: ITEM_H * 2 }} />
    </div>
  )
}

function ClockIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 text-tertiary" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5l3.2 1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

import type { ReactNode } from 'react'

/**
 * Apple-style UI primitives: a grouped scroll container with a large title,
 * widget cards, and inset grouped lists. Used across every screen so the app
 * reads as one cohesive system rather than a pile of ad-hoc layouts.
 */

/** Full-screen grouped background with a collapsing-style large title. */
export function Screen({
  title,
  trailing,
  children,
}: {
  title: string
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-grouped">
      <div className="safe-top mx-auto max-w-md px-4 pt-2 pb-28">
        <div className="mb-2 flex min-h-11 items-center justify-between">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight text-label">
            {title}
          </h1>
          {trailing && <div className="flex items-center gap-1">{trailing}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}

/** A widget card — the iOS rounded rectangle on the grouped background. */
export function Card({
  children,
  className = '',
  as = 'div',
  onClick,
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'button'
  onClick?: () => void
}) {
  const cls = `card-shadow rounded-2xl bg-card ${className}`
  if (as === 'button') {
    return (
      <button type="button" onClick={onClick} className={`w-full text-left ${cls}`}>
        {children}
      </button>
    )
  }
  return <div className={cls}>{children}</div>
}

/** Small grouped-list section header (secondary gray). */
export function GroupHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 ml-1 text-[13px] font-semibold tracking-wide text-secondary uppercase">
      {children}
    </h2>
  )
}

/** Inset grouped list — rows divided by hairlines inside one rounded card. */
export function ListGroup({ children }: { children: ReactNode }) {
  return (
    <div className="card-shadow overflow-hidden rounded-2xl bg-card">
      <div className="divide-y divide-separator">{children}</div>
    </div>
  )
}

/** One inset-grouped list row. Trailing content sits right-aligned. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  chevron,
  destructive,
}: {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  chevron?: boolean
  destructive?: boolean
}) {
  const inner = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div
          className={`text-[17px] ${destructive ? 'text-red-600' : 'text-label'}`}
        >
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-[13px] text-secondary">{subtitle}</div>
        )}
      </div>
      {trailing && <div className="shrink-0 text-secondary">{trailing}</div>}
      {chevron && (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-tertiary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </>
  )
  const cls =
    'flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left'
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} active:bg-fill`}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}

/** iOS switch. */
export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-brand' : 'bg-[#e9e9ea]'}`}
    >
      <span
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
      />
    </button>
  )
}

/** iOS segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={`inline-flex rounded-[9px] bg-[#76768014] p-0.5 ${size === 'sm' ? 'text-[13px]' : 'text-[15px]'}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`min-h-8 rounded-[7px] px-3 font-medium transition-colors ${
            value === o.value
              ? 'bg-white text-label shadow-sm'
              : 'text-secondary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

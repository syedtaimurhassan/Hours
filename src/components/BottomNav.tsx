export type Tab = 'track' | 'history'

/** Apple-style frosted tab bar. */
export function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-separator bg-card/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md">
        <TabButton
          active={tab === 'track'}
          label="Timer"
          onClick={() => onChange('track')}
          icon={(filled) => (
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.7}>
              <circle cx="12" cy="12" r="9" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.7} />
              <path d="M12 7.5v4.8l3 1.8" fill="none" stroke={filled ? '#fff' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        />
        <TabButton
          active={tab === 'history'}
          label="Timesheet"
          onClick={() => onChange('history')}
          icon={(filled) => (
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={filled ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2.5" fill={filled ? 'currentColor' : 'none'} />
              <path d="M8 9h8M8 13h8M8 17h5" stroke={filled ? '#fff' : 'currentColor'} />
            </svg>
          )}
        />
      </div>
    </nav>
  )
}

function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: (filled: boolean) => React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 ${
        active ? 'text-brand-deep' : 'text-tertiary'
      }`}
    >
      {icon(active)}
      <span className={`text-[11px] ${active ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
    </button>
  )
}

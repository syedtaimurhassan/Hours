export type Tab = 'track' | 'history'

/**
 * Labeled text + icon tabs in thumb reach. The History glyph is a list —
 * never a clock, which is ambiguous in a timer app.
 */
export function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md">
        <TabButton
          active={tab === 'track'}
          label="Track"
          onClick={() => onChange('track')}
          icon={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          }
        />
        <TabButton
          active={tab === 'history'}
          label="History"
          onClick={() => onChange('history')}
          icon={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          }
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
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
        active ? 'text-emerald-700' : 'text-slate-500'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

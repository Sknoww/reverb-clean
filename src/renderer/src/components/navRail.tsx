import { ArrowUpDown, Command, Settings, SquareTerminal, Workflow } from 'lucide-react'
import { ComponentType } from 'react'
import { useLocation } from 'react-router-dom'
import { cn, useNavigationLock } from '@/lib/utils'
import logo from '../assets/icon.png'

interface NavItem {
  to: string
  // Full name for tooltip / a11y; `label` is the short rail caption.
  name: string
  label?: string
  Icon: ComponentType<{ className?: string }>
}

const PRIMARY_ITEMS: NavItem[] = [
  { to: '/', name: 'Commands', label: 'Cmds', Icon: Command },
  { to: '/flows', name: 'Flows', label: 'Flows', Icon: Workflow },
  { to: '/console', name: 'Console', label: 'Cons', Icon: SquareTerminal },
  // Sync's `⇅` (spec D1). `RefreshCw` is taken by project-reload and `Workflow`
  // by Flows, so neither of the obvious glyphs was available.
  { to: '/sync', name: 'Sync', label: 'Sync', Icon: ArrowUpDown }
]

const SETTINGS_ITEM: NavItem = { to: '/settings', name: 'Settings', Icon: Settings }

function RailItem({
  item,
  active,
  onNavigate
}: {
  item: NavItem
  active: boolean
  onNavigate: (to: string) => void
}) {
  const { Icon, label, name, to } = item
  return (
    <button
      type="button"
      onClick={() => onNavigate(to)}
      title={name}
      aria-label={name}
      aria-current={active ? 'page' : undefined}
      className="relative flex w-full items-center justify-center"
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-[2px] bg-accent-indigo" />
      )}
      <span
        className={cn(
          'flex h-[42px] w-[42px] flex-col items-center justify-center gap-1 rounded-[11px] transition-colors',
          active ? 'bg-nav-active' : 'hover:bg-nav-active/40'
        )}
      >
        <Icon
          className={cn('h-[15px] w-[15px]', active ? 'text-accent-indigo' : 'text-glyph-dim')}
        />
        {label && (
          <span
            className={cn(
              'font-mono text-[10px] font-medium leading-none',
              active ? 'text-accent-indigo-bright' : 'text-text-dim'
            )}
          >
            {label}
          </span>
        )}
      </span>
    </button>
  )
}

export function NavRail() {
  const { pathname } = useLocation()
  const { safeNavigate } = useNavigationLock()

  return (
    <nav className="flex w-[62px] flex-shrink-0 flex-col items-center gap-4 border-r border-hairline bg-surface-chrome py-3">
      <div className="h-[34px] w-[34px] flex-shrink-0 overflow-hidden rounded-[9px]">
        <img src={logo} alt="Reverb" className="h-full w-full object-cover" />
      </div>
      <div className="flex w-full flex-1 flex-col items-center gap-2">
        {PRIMARY_ITEMS.map((item) => (
          <RailItem
            key={item.to}
            item={item}
            active={pathname === item.to}
            onNavigate={safeNavigate}
          />
        ))}
      </div>
      <RailItem
        item={SETTINGS_ITEM}
        active={pathname === SETTINGS_ITEM.to}
        onNavigate={safeNavigate}
      />
    </nav>
  )
}

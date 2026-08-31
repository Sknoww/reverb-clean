import { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { NavRail } from './navRail'

const DOCKLESS_ROUTES = new Set(['/sync', '/settings'])

export function Shell({
  topBar,
  dock,
  statusBar,
  children,
  dockCollapsed
}: {
  topBar: ReactNode
  dock: ReactNode
  statusBar: ReactNode
  children: ReactNode
  dockCollapsed: boolean
}) {
  const { pathname } = useLocation()
  const showDock = !DOCKLESS_ROUTES.has(pathname)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-shell">
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 flex-shrink-0 items-center border-b border-hairline px-5">
            {topBar}
          </header>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">{children}</main>
        </div>
        {showDock && (
          <aside
            className={cn(
              'flex flex-shrink-0 flex-col border-l border-hairline bg-surface-chrome',
              dockCollapsed ? 'w-11' : 'w-[264px]'
            )}
          >
            {dock}
          </aside>
        )}
      </div>
      {statusBar}
    </div>
  )
}

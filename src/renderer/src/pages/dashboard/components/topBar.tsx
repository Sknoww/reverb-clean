import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Config, Project } from '@/types'
import { ChevronDown, ListChecks, RefreshCw, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { LuTrash2 } from 'react-icons/lu'
import { useLocation } from 'react-router-dom'
import { useSyncContext } from '../contexts/syncContext'
import { ConfirmModal } from './confirmModal'
import { DeviceSelector } from './deviceSelector'
import { ProjectMenu } from './projectSelect'
import { SyncProfileMenu } from './syncProfileMenu'

const SCREENS: Record<string, { title: string; breadcrumb: boolean }> = {
  '/': { title: 'Commands', breadcrumb: true },
  '/flows': { title: 'Flows', breadcrumb: true },
  '/console': { title: 'Console', breadcrumb: false },
  '/sync': { title: 'Sync', breadcrumb: false },
  '/settings': { title: 'Settings', breadcrumb: false }
}

interface TopBarProps {
  project: Project | null
  projects: Project[]
  config: Config
  onRefreshProject: () => void
  onResetClient: () => void
  onClearStorage: () => void
  onRunProvision: () => void

  canResetClient: boolean

  canProvision: boolean
  onOpenProjectFile: () => void
}

export function TopBar({
  project,
  projects,
  config,
  onRefreshProject,
  onResetClient,
  onClearStorage,
  onRunProvision,
  canResetClient,
  canProvision,
  onOpenProjectFile
}: TopBarProps) {
  const [confirmClear, setConfirmClear] = useState(false)
  const { pathname } = useLocation()
  const screen = SCREENS[pathname] ?? SCREENS['/']
  const isSyncRoute = pathname === '/sync'

  const isClientRoute = !isSyncRoute && pathname !== '/settings'
  const sync = useSyncContext()

  if (isSyncRoute) {
    return (
      <div className="flex w-full min-w-0 items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex-shrink-0 text-[15px] font-semibold text-foreground">Sync</span>
          <button
            type="button"
            onClick={() => void sync.rescan()}
            disabled={sync.scanning || !sync.configured}
            title="Re-scan the source YAML"
            aria-label="Re-scan the source YAML"
            className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', sync.scanning && 'animate-spin')} />
          </button>
          {sync.configured && (
            <>
              <span className="flex-shrink-0 text-glyph-dimmer">/</span>
              <SyncProfileMenu />
            </>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2.5">
          <DeviceSelector />
          <Button
            onClick={() => void sync.openPreview()}
            disabled={sync.pending.total === 0}
            title={
              sync.pending.total === 0
                ? 'Nothing staged — your local YAML already matches your selection'
                : 'Review and write the local YAML'
            }
            className="h-[34px] gap-1.5 rounded-[9px] px-3.5 text-[13px]"
          >
            Apply
            {sync.pending.total > 0 && (
              <span className="rounded px-1.5 py-px font-mono text-[11px] text-primary-foreground/90 ring-1 ring-inset ring-primary-foreground/25">
                {sync.pending.total}
              </span>
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex-shrink-0 text-[15px] font-semibold text-foreground">
          {screen.title}
        </span>
        {screen.breadcrumb && (
          <>
            <span className="flex-shrink-0 text-glyph-dimmer">/</span>
            <ProjectMenu
              currentProject={project}
              projects={projects}
              currentFile={config.recentProjectId}
              onOpenProjectFile={onOpenProjectFile}
            />
            <button
              type="button"
              onClick={onRefreshProject}
              disabled={!project}
              title="Reload project from disk"
              aria-label="Reload project from disk"
              className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <DeviceSelector />

        {isClientRoute && (
          <>
            <div
              title={
                canResetClient || canProvision
                  ? undefined
                  : 'No target configured — set a package id and launcher activity in Settings → Target'
              }
              className={cn(
                'flex h-[34px] flex-shrink-0 items-stretch overflow-hidden rounded-[9px] border border-border-control',
                !canResetClient && !canProvision && 'opacity-40'
              )}
            >
              <button
                type="button"
                onClick={onResetClient}
                disabled={!canResetClient}
                title={
                  canResetClient
                    ? 'Reset client application'
                    : 'No target configured — set a package id and launcher activity in Settings → Target'
                }
                className="flex items-center gap-1.5 px-3 text-[13px] text-zinc-300 transition-colors hover:bg-row-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset client
              </button>

              <span className="w-px flex-shrink-0 bg-border-control" aria-hidden />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={!canResetClient && !canProvision}
                    aria-label="More device actions"
                    title={canResetClient || canProvision ? 'More device actions' : undefined}
                    className="flex w-[26px] flex-shrink-0 items-center justify-center text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground disabled:pointer-events-none"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-60" align="end">
                  <DropdownMenuItem
                    className="cursor-pointer gap-2"
                    disabled={!canProvision}
                    title={
                      canProvision
                        ? 'Run the provisioning steps — no restart'
                        : 'No provisioning steps configured — add them in Settings → Provisioning'
                    }
                    onSelect={onRunProvision}
                  >
                    <ListChecks size={14} className="flex-shrink-0" />
                    Run provisioning
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-red-300 focus:text-red-300"
                    disabled={!canResetClient}
                    title={
                      canResetClient
                        ? undefined
                        : 'No target configured — set a package id and launcher activity in Settings → Target'
                    }
                    onSelect={() => setConfirmClear(true)}
                  >
                    <LuTrash2 size={14} className="flex-shrink-0" />
                    Clear client storage
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>
      <ConfirmModal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false)
          onClearStorage()
        }}
        marker={<LuTrash2 className="h-3.5 w-3.5 text-red-400" aria-hidden />}
        title="Clear client storage"
        confirmLabel="Clear storage"
        description="Wipe the target app's data on the device, then relaunch it."
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          This wipes everything{' '}
          <span className="font-mono text-foreground">{config.target?.packageId}</span> has stored
          on the device — logins, settings and cached state — and then relaunches it.
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          It happens on the device, so there is nothing to restore it from.
        </p>
      </ConfirmModal>
    </div>
  )
}

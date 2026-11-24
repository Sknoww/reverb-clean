import { cn } from '@/lib/utils'
import { useDeviceContext } from '@/pages/dashboard/contexts/deviceContext'
import { useSyncContext } from '@/pages/dashboard/contexts/syncContext'
import { ProvisionProgress, WorkflowState } from '@/types'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

export interface LastRun {
  label: string

  ms?: number

  // 'note' is for an outcome that is neither: a scan the user cancelled did not fail.
  tone: 'ok' | 'fail' | 'note'

  undo?: () => void
}

const TONE_STYLE: Record<LastRun['tone'], { color: string; marker: string }> = {
  ok: { color: 'text-success', marker: '✓' },
  fail: { color: 'text-red-300', marker: '✕' },
  note: { color: 'text-stale', marker: '✕' }
}

export interface FlowProgress {
  name: string
  step: number
  total: number
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function checkoutName(connectorRoot: string): string {
  const parts = connectorRoot.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function shortPackage(packageId: string): string {
  return packageId.split('.').slice(-2).join('.')
}

export function StatusBar({
  lastRun,
  flowProgress,
  provisionProgress,
  packageId
}: {
  lastRun: LastRun | null
  flowProgress: FlowProgress | null

  provisionProgress: ProvisionProgress | null

  packageId: string
}) {
  const { activeDevice } = useDeviceContext()
  const { pathname } = useLocation()
  const [adbVersion, setAdbVersion] = useState<string | null>(null)

  const sync = useSyncContext()
  const isSyncRoute = pathname === '/sync'

  const [workflowState, setWorkflowState] = useState<WorkflowState>({})

  useEffect(() => {
    void window.adbAPI.getVersion().then(setAdbVersion)
  }, [])

  useEffect(() => {
    const unsubscribe = window.adbAPI.onWorkflowState(setWorkflowState)
    return unsubscribe
  }, [])

  const deviceId = activeDevice?.id ?? ''
  useEffect(() => {
    void window.adbAPI.watchWorkflow(deviceId, packageId)
  }, [deviceId, packageId])

  const deviceLabel = activeDevice
    ? `${activeDevice.model ? `${activeDevice.model} · ` : ''}${activeDevice.id}`
    : 'No device'

  return (
    <footer className="flex h-8 flex-shrink-0 items-center justify-between gap-4 border-t border-hairline bg-surface-chrome px-4 font-mono text-[11px] text-text-dim">
      <div className="flex min-w-0 items-center gap-4">
        <span
          className="flex min-w-0 items-center gap-1.5 text-muted-foreground"
          title={activeDevice ? deviceLabel : 'No devices connected'}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 flex-shrink-0 rounded-full',
              activeDevice ? 'bg-status-connected' : 'bg-red-900'
            )}
          />
          <span className="truncate">{deviceLabel}</span>
        </span>

        {isSyncRoute ? (
          <>
            {sync.scan?.connectorRoot && (
              <span className="flex-shrink-0 truncate" title={sync.scan.connectorRoot}>
                {checkoutName(sync.scan.connectorRoot)}
              </span>
            )}

            {sync.scan?.branch && <span className="flex-shrink-0">branch {sync.scan.branch}</span>}
          </>
        ) : (
          <>
            {adbVersion && <span className="flex-shrink-0">adb {adbVersion}</span>}
            {packageId && (
              <span className="flex-shrink-0 truncate" title={packageId}>
                {shortPackage(packageId)}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-4">
        {isSyncRoute ? (
          <>
            {sync.applyNotice ? (
              <span className="text-success">{sync.applyNotice}</span>
            ) : sync.scan?.ok ? (
              <span>
                {sync.scan.entries.length} workflows · {sync.selected.size} selected
                {sync.pending.bumps.length > 0 && (
                  <span className="text-stale"> · {sync.pending.bumps.length} out of date</span>
                )}
              </span>
            ) : (
              <span>no source scanned</span>
            )}
            {sync.scanning ? (
              <span>scanning…</span>
            ) : (
              sync.scannedAt && (
                <span>
                  scanned {sync.scannedAt.toLocaleTimeString(undefined, { hour12: false })}
                </span>
              )
            )}
          </>
        ) : (
          <>
            {workflowState.workflow && workflowState.step && (
              <span className="group relative">
                <span className="block max-w-[360px] truncate">
                  {workflowState.workflow}: {workflowState.step}
                </span>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden w-max max-w-[480px] flex-col gap-0.5 rounded-md border border-border-control bg-surface-editor px-3 py-2 text-[11px] text-foreground shadow-lg group-hover:flex"
                >
                  <span>Workflow: {workflowState.workflow}</span>
                  <span>Step: {workflowState.step}</span>
                </span>
              </span>
            )}
            {provisionProgress ? (
              <span
                className="flex items-center gap-1.5 text-success"
                title={provisionProgress.label}
              >
                <span aria-hidden>▶</span>
                <span>
                  provision · step {provisionProgress.index + 1}/{provisionProgress.total}
                </span>
              </span>
            ) : flowProgress ? (
              <span className="flex items-center gap-1.5 text-success">
                <span aria-hidden>▶</span>
                <span className="max-w-[280px] truncate">{flowProgress.name}</span>
                <span>
                  · step {flowProgress.step}/{flowProgress.total}
                </span>
              </span>
            ) : (
              lastRun && (
                <span className={cn('flex items-center gap-1.5', TONE_STYLE[lastRun.tone].color)}>
                  <span aria-hidden>{TONE_STYLE[lastRun.tone].marker}</span>
                  <span className="max-w-[280px] truncate">
                    {lastRun.ms === undefined ? lastRun.label : `last run: ${lastRun.label}`}
                  </span>
                  {lastRun.ms !== undefined && <span>· {formatDuration(lastRun.ms)}</span>}
                  {lastRun.undo && (
                    <button
                      type="button"
                      onClick={lastRun.undo}
                      title="Restore the previous value"
                      className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                    >
                      · undo
                    </button>
                  )}
                </span>
              )
            )}
          </>
        )}
      </div>
    </footer>
  )
}

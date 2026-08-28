import { COMMAND_BAR_KEY } from '@/constants/shortcuts'
import { cn } from '@/lib/utils'
import { useDeviceContext } from '@/pages/dashboard/contexts/deviceContext'
import { useSyncContext } from '@/pages/dashboard/contexts/syncContext'
import { ProvisionProgress } from '@/types'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

// Persistent shell status bar (redesign C8).

export interface LastRun {
  // Command name, falling back to its keyword.
  label: string
  ms: number
  ok: boolean
}

export interface FlowProgress {
  name: string
  step: number
  total: number
}

// Per-route keyboard hint.
const HINTS: Record<string, string> = {
  '/': `${COMMAND_BAR_KEY} command bar`
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/** Last path segment — the checkout's own name is what identifies it here. */
function checkoutName(connectorRoot: string): string {
  const parts = connectorRoot.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** The last two segments, as drawn in the frames; the full id is the tooltip. */
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
  /** A provisioning routine mid-run (28b2), pushed from main step by step. */
  provisionProgress: ProvisionProgress | null
  /** The configured target package (area 19) — a constant of this tool until 19, mirrored here from main by hand. */
  packageId: string
}) {
  const { activeDevice } = useDeviceContext()
  const { pathname } = useLocation()
  const [adbVersion, setAdbVersion] = useState<string | null>(null)

  // Sync's readout (S2, frame 6a).
  const sync = useSyncContext()
  const isSyncRoute = pathname === '/sync'

  useEffect(() => {
    void window.adbAPI.getVersion().then(setAdbVersion)
  }, [])

  const deviceLabel = activeDevice
    ? `${activeDevice.model ? `${activeDevice.model} · ` : ''}${activeDevice.id}`
    : 'No device'
  const hint = HINTS[pathname]

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
            {/* D13: degrades silently — no branch when it isn't a checkout. */}
            {sync.scan?.branch && <span className="flex-shrink-0">branch {sync.scan.branch}</span>}
          </>
        ) : (
          <>
            {/* Omitted rather than guessed when adb can't be read. */}
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
            {/* Precedence: a provisioning routine, else a running flow, else the
                last run. A flow owns the slot over last-run because its steps
                write last-run too, which would otherwise churn the text on
                every command; provisioning owns it over both for the reason on
                the prop. The label is the tooltip rather than inline — the step
                names here are shell command lines and push paths, which would
                push the count off the end of the bar. */}
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
                <span
                  className={cn(
                    'flex items-center gap-1.5',
                    lastRun.ok ? 'text-success' : 'text-red-300'
                  )}
                >
                  <span aria-hidden>{lastRun.ok ? '✓' : '✕'}</span>
                  <span className="max-w-[280px] truncate">last run: {lastRun.label}</span>
                  <span>· {formatDuration(lastRun.ms)}</span>
                </span>
              )
            )}
            {hint && <span>{hint}</span>}
          </>
        )}
      </div>
    </footer>
  )
}

import { cn } from '@/lib/utils'
import { BundleResult, ConfigSnapshot } from '@/types'
import { Settings as SettingsGlyph } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ConfirmModal } from './confirmModal'
import { SETTINGS_BUTTON, SettingsDivider, SettingsNumber, SettingsRow } from './settingsSection'

// Settings' Data section (area 18a) — the UI area 17b's backend was built for.

const MARKER = <SettingsGlyph className="h-3.5 w-3.5 text-accent-indigo" aria-hidden />

/** `2026-07-27 14:03:22` — sortable, unambiguous, and what a log line looks like. */
function formatStamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

interface Notice {
  ok: boolean
  text: string
}

/** Shared read of a bundle call — cancel is not an outcome worth reporting. */
function bundleNotice(result: BundleResult, verb: 'Exported' | 'Imported'): Notice | null {
  if (!result.success) {
    return result.filePath === null && !result.error
      ? null // cancelled the picker
      : { ok: false, text: result.error ?? `${verb} failed.` }
  }

  const count = result.projectCount
  return {
    ok: true,
    text: `${verb} config and ${count} project${count === 1 ? '' : 's'}.`
  }
}

/** Mirrors `SNAPSHOT_BOUNDS` in configManager. */
const SNAPSHOT_BOUNDS = { min: 1, max: 50 }

export function SettingsData({
  maxSnapshots,
  onConfigReplaced
}: {
  /** 18b made retention a field; 5 is the default 18a trimmed it to. */
  maxSnapshots: number
  onConfigReplaced: () => void
}) {
  const [snapshots, setSnapshots] = useState<ConfigSnapshot[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<ConfigSnapshot | null>(null)
  const [confirmImport, setConfirmImport] = useState(false)

  const refreshSnapshots = useCallback(async () => {
    setSnapshots(await window.configAPI.listConfigSnapshots())
  }, [])

  useEffect(() => {
    void refreshSnapshots()
  }, [refreshSnapshots])

  const handleRestore = async () => {
    if (!pendingRestore) return
    const snapshot = pendingRestore
    setPendingRestore(null)
    setBusy(true)
    try {
      const ok = await window.configAPI.restoreConfigSnapshot(snapshot.fileName)
      setNotice(
        ok
          ? { ok: true, text: `Restored config from ${formatStamp(snapshot.savedAt)}.` }
          : { ok: false, text: 'Restore failed — the current config is unchanged.' }
      )
      // The restore wrote a snapshot of what it replaced, so the list grew.
      await refreshSnapshots()
      if (ok) onConfigReplaced()
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    setBusy(true)
    try {
      setNotice(bundleNotice(await window.configAPI.exportBundle(), 'Exported'))
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    setConfirmImport(false)
    setBusy(true)
    try {
      const result = await window.configAPI.importBundle()
      setNotice(bundleNotice(result, 'Imported'))
      await refreshSnapshots()
      if (result.success) onConfigReplaced()
    } finally {
      setBusy(false)
    }
  }

  // Lowering the cap trims on the write that lowers it (`snapshotCurrentFile` rotates against the *pending* config), so the list below...
  const handleRetention = async (max: number) => {
    await window.configAPI.updateMaxSnapshots(max)
    await refreshSnapshots()
    onConfigReplaced()
  }

  const handleOpenConfig = async () => {
    const filePath = await window.configAPI.getConfigFilePath()
    if (filePath) await window.dialogAPI.openInEditor(filePath)
  }

  return (
    <>
      <SettingsRow
        label="Backup bundle"
        hint="One file carrying config and every project — the fresh-machine restore."
      >
        <button type="button" onClick={handleExport} disabled={busy} className={SETTINGS_BUTTON}>
          Export…
        </button>
        <button
          type="button"
          onClick={() => setConfirmImport(true)}
          disabled={busy}
          className={SETTINGS_BUTTON}
        >
          Import…
        </button>
      </SettingsRow>

      <SettingsDivider />

      <SettingsRow label="Config file" hint="Open config.json in your editor.">
        <button type="button" onClick={handleOpenConfig} className={SETTINGS_BUTTON}>
          Open…
        </button>
      </SettingsRow>

      <SettingsDivider />

      <SettingsNumber
        label="Snapshots kept"
        hint="Older ones are dropped on the next write. A config is ~1 KB, so this is the whole disk cost."
        value={maxSnapshots}
        min={SNAPSHOT_BOUNDS.min}
        max={SNAPSHOT_BOUNDS.max}
        onCommit={(max) => void handleRetention(max)}
      />

      <SettingsDivider />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[13px] text-foreground">Snapshots</span>
          <span className="font-mono text-[11px] text-glyph-dim">
            {snapshots.length} kept · newest first
          </span>
        </div>
        <p className="text-xs leading-snug text-glyph-dim">
          Taken automatically before every config write. Restoring is itself a write, so it can be
          undone from this list.
        </p>

        {snapshots.length === 0 ? (
          <p className="pt-1 text-xs text-muted-foreground">
            No snapshots yet — the first one is taken the next time config changes.
          </p>
        ) : (
          <div
            className="mt-1 max-h-[260px] overflow-y-auto pr-1"
            style={{ scrollbarGutter: 'stable' }}
          >
            {/*
              No row accent here. An earlier pass marked `index === 0` — but a
              restore is itself a write, so it snapshots the current bytes first
              and the new top row holds the config you just moved *away from*.
              The rule sat on the discarded state and never appeared to move.
              Every snapshot is a *pre*-write state and the live config is a
              *post*-write one, so no row is "the current one" to begin with.
            */}
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.fileName}
                className="flex h-10 items-center gap-3 rounded-lg px-2.5 transition-colors hover:bg-row-hover"
              >
                <span className="flex-1 truncate font-mono text-xs text-text-dim">
                  {formatStamp(snapshot.savedAt)}
                </span>
                <span className="flex-shrink-0 font-mono text-[11px] text-glyph-dim">
                  {formatSize(snapshot.size)}
                </span>
                <button
                  type="button"
                  onClick={() => setPendingRestore(snapshot)}
                  disabled={busy}
                  className="h-7 flex-shrink-0 rounded-md border border-border-control px-2.5 text-xs text-zinc-300 transition-colors hover:bg-row-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {notice && (
        <p className={cn('text-xs leading-snug', notice.ok ? 'text-success' : 'text-red-300')}>
          {notice.text}
        </p>
      )}

      <ConfirmModal
        isOpen={pendingRestore !== null}
        onClose={() => setPendingRestore(null)}
        onConfirm={() => void handleRestore()}
        marker={MARKER}
        title="Restore snapshot"
        confirmLabel="Restore"
        description="Replace the current config with this snapshot."
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Your current config is replaced by the one saved at{' '}
          <span className="font-mono text-foreground">
            {pendingRestore ? formatStamp(pendingRestore.savedAt) : ''}
          </span>
          . Projects on disk are not touched, and the config being replaced is snapshotted first —
          so this is undoable from the same list.
        </p>
      </ConfirmModal>

      <ConfirmModal
        isOpen={confirmImport}
        onClose={() => setConfirmImport(false)}
        onConfirm={() => void handleImport()}
        marker={MARKER}
        title="Import backup bundle"
        confirmLabel="Choose file…"
        description="Replace config and overwrite matching projects from a backup bundle."
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          An import <span className="text-foreground">replaces your config outright</span> and
          overwrites any project whose file name matches one in the bundle.
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          The config it replaces is snapshotted first. Projects are not — export your own bundle
          before importing if this machine has projects worth keeping.
        </p>
      </ConfirmModal>
    </>
  )
}

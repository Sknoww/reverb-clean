import { useScrollMemory } from '@/lib/hooks/use-scroll-memory'
import { cn } from '@/lib/utils'
import { SyncEntry } from '@/types'
import { Loader2, Search, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { SyncApplyModal } from '../components/syncApplyModal'
import { SyncGroup, SyncList } from '../components/syncList'
import { SyncPathKey, SyncPaths, SyncPathsBand, SyncSetupCard } from '../components/syncPaths'
import { useSyncContext } from '../contexts/syncContext'

type Filter = 'all' | 'selected' | 'outOfDate' | 'notInLocal'

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  selected: 'Selected',
  outOfDate: 'Out of date',
  notInLocal: 'Not in local'
}

const EMPTY_PATHS: SyncPaths = {
  connectorRoot: '',
  sourceFile: '',
  targetFile: '',
  deploymentPath: ''
}

function groupEntries(entries: SyncEntry[]): SyncGroup[] {
  const groups: SyncGroup[] = []
  const byName = new Map<string, SyncGroup>()

  for (const entry of entries) {
    const name = entry.group ?? 'ungrouped'
    let group = byName.get(name)
    if (!group) {
      group = { name, entries: [] }
      byName.set(name, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }

  return groups
}

function isTargetError(error: string): boolean {
  return error.includes('target file')
}

function ErrorBanner({
  title,
  detail,
  mono,
  actionLabel,
  onAction
}: {
  title: string
  detail?: string
  mono?: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex flex-shrink-0 items-start gap-2.5 rounded-xl border border-hairline border-l-4 border-l-destructive bg-surface-panel px-4 py-3.5">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-300" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-medium text-foreground">{title}</span>
        {mono && (
          <span className="truncate font-mono text-xs text-muted-foreground" title={mono}>
            {mono}
          </span>
        )}
        {detail && <span className="text-xs leading-relaxed text-muted-foreground">{detail}</span>}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onAction}
        className="h-8 flex-shrink-0 rounded-[9px] border border-border-control px-3 text-xs text-zinc-300 transition-colors hover:bg-row-hover hover:text-foreground"
      >
        {actionLabel}
      </button>
    </div>
  )
}

function EmptyCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-panel px-4 py-12 text-center">
      <span className="text-[13px] text-muted-foreground">{title}</span>
      <span className="max-w-sm text-xs leading-relaxed text-glyph-dim">{detail}</span>
    </div>
  )
}

export function SyncTab() {
  const {
    scan,
    scanning,
    rescan,
    configured,
    selected,
    toggleZone,
    setZones,
    previewOpen,
    closePreview,
    plan,
    planning,
    planError,
    applying,
    applyError,
    apply
  } = useSyncContext()

  const [paths, setPaths] = useState<SyncPaths>(EMPTY_PATHS)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const listRef = useScrollMemory('sync')

  useEffect(() => {
    if (!scan) return
    setPaths({
      connectorRoot: scan.connectorRoot,
      sourceFile: scan.sourceFile,
      targetFile: scan.targetFile,
      deploymentPath: scan.deploymentPath
    })
  }, [scan])

  const changePath = async (key: SyncPathKey, value: string) => {
    setPaths((prev) => ({ ...prev, [key]: value }))
    if (key === 'connectorRoot') await window.configAPI.updateConnectorRoot(value)
    else await window.configAPI.updateSyncConfig({ [key]: value })

    await rescan()
  }

  const entries = scan?.ok ? scan.entries : []

  const counts = useMemo(
    () => ({
      all: entries.length,
      selected: entries.filter((entry) => selected.has(entry.zone)).length,
      outOfDate: entries.filter((entry) => entry.status === 'outOfDate').length,
      notInLocal: entries.filter((entry) => !entry.inTarget).length
    }),
    [entries, selected]
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return entries.filter((entry) => {
      if (filter === 'selected' && !selected.has(entry.zone)) return false
      if (filter === 'outOfDate' && entry.status !== 'outOfDate') return false
      if (filter === 'notInLocal' && entry.inTarget) return false
      if (!needle) return true

      const fileName = entry.sourceFileName ?? entry.targetFileName ?? ''
      return entry.zone.toLowerCase().includes(needle) || fileName.toLowerCase().includes(needle)
    })
  }, [entries, filter, query, selected])

  const orphans = visible.filter((entry) => entry.status === 'orphan')
  const groups = groupEntries(visible.filter((entry) => entry.status !== 'orphan'))

  if (scan && !configured) {
    return (
      <SyncSetupCard
        paths={paths}
        onChange={changePath}
        onScan={() => void rescan()}
        scanning={scanning}
      />
    )
  }

  if (!scan) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Scanning…
      </div>
    )
  }

  const filterChip = (value: Filter) =>
    filter === value
      ? 'bg-nav-active border-border-bar text-foreground'
      : 'border-hairline text-muted-foreground hover:text-foreground'

  return (
    <div className="flex h-full flex-col gap-3">
      <SyncPathsBand paths={paths} onChange={changePath} />

      {scan.error &&
        (isTargetError(scan.error) ? (
          <ErrorBanner
            title="Local YAML not found"
            mono={paths.targetFile}
            detail="Sync edits an existing file and won't author one. Check the path or create the file, then re-scan."
            actionLabel="Choose file…"
            onAction={async () => {
              const picked = await window.dialogAPI.selectYamlFile(
                'Select your local YAML',
                paths.connectorRoot
              )
              if (picked) await changePath('targetFile', picked)
            }}
          />
        ) : (
          <ErrorBanner
            title="The source YAML could not be read"
            mono={scan.error}
            actionLabel="Re-scan"
            onAction={() => void rescan()}
          />
        ))}

      {scan.ok && (
        <>
          <div className="flex flex-shrink-0 items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              {(Object.keys(FILTER_LABELS) as Filter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-[9px] border px-3 text-[13px] transition-colors',
                    filterChip(value)
                  )}
                >
                  {FILTER_LABELS[value]}
                  <span
                    className={cn(
                      'font-mono text-[11px]',
                      value === 'outOfDate' && counts.outOfDate > 0
                        ? 'text-stale'
                        : 'text-glyph-dim'
                    )}
                  >
                    {counts[value]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex h-8 w-[260px] flex-shrink-0 items-center gap-2 rounded-[9px] border border-border-control bg-surface-control px-2.5">
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-glyph-dim" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter zone or filename…"
                aria-label="Filter zone or filename"
                className="bare-input min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-glyph-dimmer"
              />
            </div>
          </div>

          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto pb-4 pr-1"
            style={{ scrollbarGutter: 'stable' }}
          >
            {visible.length > 0 ? (
              <SyncList
                groups={groups}
                orphans={orphans}
                selected={selected}
                onToggle={toggleZone}
                onToggleMany={setZones}
              />
            ) : query.trim() ? (
              <EmptyCard
                title={`No workflows match “${query.trim()}”`}
                detail="Clear the filter or switch to All."
              />
            ) : filter === 'outOfDate' ? (
              <EmptyCard
                title="Everything is current"
                detail={`All ${counts.selected} selected workflows match the source. Nothing to apply.`}
              />
            ) : (
              <EmptyCard
                title="Nothing in this view"
                detail="Switch to All to see every workflow the source declares."
              />
            )}
          </div>
        </>
      )}

      <SyncApplyModal
        isOpen={previewOpen}
        onClose={closePreview}
        onConfirm={() => void apply()}
        plan={plan}
        planning={planning}
        planError={planError}
        applying={applying}
        applyError={applyError}
      />
    </div>
  )
}

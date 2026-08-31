import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { SyncEntry } from '@/types'
import { ChevronDown, ChevronRight, ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'

const GRID = '30px minmax(150px,1fr) 200px 130px minmax(220px,1.6fr) 36px'

export type RowState = 'add' | 'remove' | 'bump' | 'current' | 'available' | 'orphan'

export function rowStateOf(entry: SyncEntry, selected: boolean): RowState {
  if (entry.status === 'orphan') return selected ? 'orphan' : 'remove'
  if (entry.inTarget && !selected) return 'remove'
  if (!entry.inTarget) return selected ? 'add' : 'available'
  return entry.status === 'outOfDate' ? 'bump' : 'current'
}

const ROW_ACCENT: Partial<Record<RowState, string>> = {
  bump: 'bg-stale/[0.045] shadow-[inset_2px_0_0_hsl(var(--stale))]',
  add: 'bg-mono-keyword/[0.05] shadow-[inset_2px_0_0_hsl(var(--mono-keyword))]',
  remove: 'bg-destructive/20 shadow-[inset_2px_0_0_hsl(var(--destructive))]'
}

const REVEAL_LABEL = navigator.platform.startsWith('Mac') ? 'Reveal in Finder' : 'Show in Explorer'

function formatVersion(date: string | null, revision: number | null): string {
  if (!date) return ''
  return `${date.replace(/-/g, '_')}${revision === null ? '' : `_${revision}`}`
}

function Badge({ tone, children }: { tone: 'add' | 'remove' | 'stale'; children: string }) {
  const tones = {
    add: 'text-accent-indigo-bright bg-nav-active',
    remove: 'text-red-300 bg-destructive/50',

    stale: 'text-stale bg-stale/[0.16]'
  }
  return (
    <span
      className={cn(
        'flex-shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em]',
        tones[tone]
      )}
    >
      {children}
    </span>
  )
}

function StatusCell({ state, fileMissing }: { state: RowState; fileMissing: boolean }) {
  const missing = fileMissing && <Badge tone="stale">NO FILE</Badge>

  if (state === 'add') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Badge tone="add">＋ ADD</Badge>
        {missing}
      </span>
    )
  }
  if (state === 'remove') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Badge tone="remove">− REMOVE</Badge>
      </span>
    )
  }
  if (state === 'orphan') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Badge tone="remove">ORPHAN</Badge>
        {missing}
      </span>
    )
  }

  const dots: Record<
    'bump' | 'current' | 'available',
    { dot: string; text: string; label: string }
  > = {
    bump: { dot: 'bg-stale', text: 'text-stale', label: 'Out of date' },
    current: { dot: 'bg-success-muted', text: 'text-text-dim', label: 'Current' },
    available: {
      dot: 'border border-zinc-700',
      text: 'text-glyph-dim',
      label: 'Available'
    }
  }
  const style = dots[state]

  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 text-xs', style.text)}>
      <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', style.dot)} aria-hidden />
      <span className="truncate">{style.label}</span>
      {missing}
    </span>
  )
}

function VersionCell({ entry, state }: { entry: SyncEntry; state: RowState }) {
  if (state === 'bump') {
    return (
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
        <span className="truncate text-glyph-dimmer line-through">
          {formatVersion(entry.targetVersion, entry.targetRevision)}
        </span>
        <span className="flex-shrink-0 text-glyph-dim">→</span>
        <span className="flex-shrink-0 font-medium text-stale">
          {formatVersion(entry.sourceVersion, entry.sourceRevision)}
        </span>
      </span>
    )
  }

  const version = entry.sourceVersion
    ? formatVersion(entry.sourceVersion, entry.sourceRevision)
    : formatVersion(entry.targetVersion, entry.targetRevision)
  const active = state === 'current' || state === 'add' || state === 'orphan'

  return (
    <span
      className={cn('truncate font-mono text-xs', active ? 'text-text-dim' : 'text-glyph-dimmer')}
    >
      {version}
    </span>
  )
}

interface RowProps {
  entry: SyncEntry
  selected: boolean
  onToggle: (zone: string, next: boolean) => void
}

function SyncRow({ entry, selected, onToggle }: RowProps) {
  const state = rowStateOf(entry, selected)
  const fileName = entry.sourceFileName ?? entry.targetFileName ?? ''

  const revealable = !entry.fileMissing && Boolean(entry.localPath)

  return (
    <div
      style={{ gridTemplateColumns: GRID }}
      className={cn(
        'grid items-center gap-3 border-b border-surface-control px-3.5 py-2.5 text-[13px] transition-colors last:border-b-0',
        ROW_ACCENT[state] ?? 'hover:bg-row-hover'
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(next) => onToggle(entry.zone, next === true)}
        aria-label={`Include ${entry.zone}`}
      />

      <span
        className={cn(
          'truncate pr-2',
          state === 'remove' && 'text-text-dim line-through',
          state === 'available' && 'text-muted-foreground',
          state !== 'remove' && state !== 'available' && 'font-medium text-foreground'
        )}
        title={entry.zone}
      >
        {entry.zone}
      </span>

      <VersionCell entry={entry} state={state} />
      <StatusCell state={state} fileMissing={entry.fileMissing} />

      <span
        className={cn(
          'truncate pr-2 font-mono text-xs',
          state === 'available' || state === 'remove' ? 'text-glyph-dimmer' : 'text-glyph-dim'
        )}
        title={entry.localPath || fileName}
      >
        {fileName}
      </span>

      {state === 'orphan' ? (
        <button
          type="button"
          onClick={() => onToggle(entry.zone, false)}
          title="Drop from local YAML"
          aria-label={`Drop ${entry.zone} from the local YAML`}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-hairline text-red-300 transition-colors hover:bg-destructive/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : revealable ? (
        <button
          type="button"
          onClick={() => void window.dialogAPI.revealItem(entry.localPath)}
          title={REVEAL_LABEL}
          aria-label={REVEAL_LABEL}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-hairline text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="h-7" />
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  entries: SyncEntry[]
  selected: Set<string>
  onToggle: (zone: string, next: boolean) => void
  onToggleMany: (zones: string[], next: boolean) => void

  orphan?: boolean

  first?: boolean
}

function Section({
  title,
  entries,
  selected,
  onToggle,
  onToggleMany,
  orphan,
  first
}: SectionProps) {
  const [open, setOpen] = useState(true)
  const zones = entries.map((entry) => entry.zone)
  const chosen = zones.filter((zone) => selected.has(zone)).length
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2.5 border-b border-surface-control bg-surface-editor px-3.5 py-2',
          !first && 'border-t border-t-hairline'
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <Chevron className="h-3 w-3 flex-shrink-0 text-glyph-dim" />
          <span
            className={cn(
              'truncate text-xs',
              orphan ? 'text-red-300' : 'font-mono text-mono-keyword'
            )}
          >
            {title}
          </span>
          <span className="flex-shrink-0 font-mono text-[11px] text-glyph-dim">
            {orphan ? entries.length : `${chosen}/${entries.length}`}
          </span>
        </button>
        {orphan && (
          <span className="truncate text-[11px] text-glyph-dim">
            · in your local file, gone from the source
          </span>
        )}
        <div className="flex-1" />

        <button
          type="button"
          onClick={() => onToggleMany(zones, orphan ? false : chosen < zones.length)}
          className={cn(
            'flex h-6 w-[76px] flex-shrink-0 items-center justify-center rounded-md border text-[11px] transition-colors',
            orphan
              ? 'border-destructive/60 text-red-300 hover:border-destructive hover:bg-destructive/20'
              : 'border-hairline text-text-dim hover:border-border-control hover:bg-row-hover hover:text-foreground'
          )}
        >
          {orphan ? 'Drop all' : chosen < zones.length ? 'Select all' : 'Clear all'}
        </button>
      </div>

      {open &&
        entries.map((entry) => (
          <SyncRow
            key={entry.zone}
            entry={entry}
            selected={selected.has(entry.zone)}
            onToggle={onToggle}
          />
        ))}
    </>
  )
}

export interface SyncGroup {
  name: string
  entries: SyncEntry[]
}

export function SyncList({
  groups,
  orphans,
  selected,
  onToggle,
  onToggleMany
}: {
  groups: SyncGroup[]
  orphans: SyncEntry[]
  selected: Set<string>
  onToggle: (zone: string, next: boolean) => void
  onToggleMany: (zones: string[], next: boolean) => void
}) {
  const visible = [...groups.flatMap((group) => group.entries), ...orphans]
  const chosen = visible.filter((entry) => selected.has(entry.zone)).length
  const headerState = chosen === 0 ? false : chosen === visible.length ? true : 'indeterminate'

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-panel">
      <div
        style={{ gridTemplateColumns: GRID }}
        className="grid items-center gap-3 border-b border-hairline px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-glyph-dim"
      >
        <Checkbox
          checked={headerState}
          onCheckedChange={(next) =>
            onToggleMany(
              visible.map((entry) => entry.zone),
              next === true
            )
          }
          aria-label="Select every visible zone"
        />
        <span>Zone</span>
        <span>Version</span>
        <span>Status</span>
        <span>Source filename</span>
        <span aria-hidden />
      </div>

      {groups.map((group, index) => (
        <Section
          key={group.name}
          first={index === 0}
          title={group.name}
          entries={group.entries}
          selected={selected}
          onToggle={onToggle}
          onToggleMany={onToggleMany}
        />
      ))}

      {orphans.length > 0 && (
        <Section
          orphan
          first={groups.length === 0}
          title="Orphaned"
          entries={orphans}
          selected={selected}
          onToggle={onToggle}
          onToggleMany={onToggleMany}
        />
      )}
    </div>
  )
}

export { GRID as SYNC_GRID }

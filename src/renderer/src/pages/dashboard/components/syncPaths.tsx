import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ReactNode, useState } from 'react'
import { ValueField } from './valueField'

export interface SyncPaths {
  connectorRoot: string
  sourceFile: string
  targetFile: string
  deploymentPath: string
}

export type SyncPathKey = keyof SyncPaths

export interface PathSpec<K extends string = SyncPathKey> {
  key: K
  label: string
  hint: string

  required?: string
  pick: () => Promise<string | null>
}

const PATH_SPECS = (defaultPath: string): PathSpec[] => [
  {
    key: 'connectorRoot',
    label: 'Base path',
    hint: 'connector repo root',
    required: 'Required. Every local path is composed from this checkout.',
    pick: () => window.dialogAPI.selectFolder('Select the connector checkout', defaultPath)
  },
  {
    key: 'sourceFile',
    label: 'Source',
    hint: "the connector's source YAML",
    required: 'Required. Sync only ever reads this file.',
    pick: () => window.dialogAPI.selectYamlFile("Select the connector's source YAML", defaultPath)
  },
  {
    key: 'targetFile',
    label: 'Local YAML',
    hint: 'the file Sync edits',

    required: 'Required. The file must already exist — Sync edits it, it doesn’t create it.',
    pick: () => window.dialogAPI.selectYamlFile('Select your local YAML', defaultPath)
  }
]

export const DEPLOYMENT_FIELD = {
  label: 'Deployment key',
  hint: 'dotted path to the list inside both YAMLs',
  placeholder: 'parent.child.list'
} as const

function tail(value: string, segments = 3): string {
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= segments) return value
  return `…/${parts.slice(-segments).join('/')}`
}

interface PathFieldProps<K extends string> {
  spec: PathSpec<K>
  value: string
  onChange: (key: K, value: string) => void

  clearLabel?: string
}

export function PathField<K extends string>({
  spec,
  value,
  onChange,
  clearLabel
}: PathFieldProps<K>) {
  const missing = !value

  const invalid = missing && Boolean(spec.required)

  const browse = async () => {
    const picked = await spec.pick()
    if (picked) onChange(spec.key, picked)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">
        {spec.label} <span className="ml-1 text-glyph-dim">{spec.hint}</span>
      </span>
      <div className="flex gap-2">
        <div
          title={value || undefined}
          className={cn(
            'flex h-10 min-w-0 flex-1 items-center truncate rounded-[9px] border bg-surface-control px-3',
            missing
              ? 'text-[13px] text-glyph-dimmer'
              : 'border-border-control font-mono text-xs text-foreground',
            invalid ? 'border-destructive' : missing && 'border-border-control'
          )}
        >
          {value ? tail(value) : 'Not set'}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={browse}
          className="h-10 flex-shrink-0 rounded-[9px] border-border-control bg-transparent px-3.5 text-[13px] text-zinc-300 shadow-none hover:bg-row-hover hover:text-foreground"
        >
          Browse…
        </Button>
        {clearLabel && !missing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(spec.key, '')}
            className="h-10 flex-shrink-0 rounded-[9px] border-border-control bg-transparent px-3.5 text-[13px] text-zinc-300 shadow-none hover:bg-row-hover hover:text-foreground"
          >
            {clearLabel}
          </Button>
        )}
      </div>
      {invalid && <p className="text-xs leading-snug text-red-300">{spec.required}</p>}
    </div>
  )
}

export function SyncSetupCard({
  paths,
  onChange,
  onScan,
  scanning
}: {
  paths: SyncPaths
  onChange: (key: SyncPathKey, value: string) => void
  onScan: () => void
  scanning: boolean
}) {
  const specs = PATH_SPECS(paths.connectorRoot)
  const ready = Boolean(
    paths.connectorRoot && paths.sourceFile && paths.targetFile && paths.deploymentPath
  )

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-[420px] flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[15px] font-semibold text-foreground">
            Point Sync at your connector checkout
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Four values, set once. Sync reads the connector&rsquo;s source YAML and rewrites only
            your local file.
          </p>
        </div>

        {specs.map((spec) => (
          <PathField key={spec.key} spec={spec} value={paths[spec.key]} onChange={onChange} />
        ))}

        <ValueField
          {...DEPLOYMENT_FIELD}
          value={paths.deploymentPath}
          onCommit={(value) => onChange('deploymentPath', value)}
        />

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            onClick={onScan}
            disabled={!ready || scanning}
            className="h-[38px] rounded-[9px] px-[18px] text-[13px] font-medium shadow-none"
          >
            Scan workflows
          </Button>
        </div>
      </div>
    </div>
  )
}

function BandSegment({ label, value, grow }: { label: string; value: string; grow: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', grow)}>
      <span className="flex-shrink-0 text-[11px] text-glyph-dim">{label}</span>
      <span className="truncate font-mono text-xs text-text-dim" title={value}>
        {value ? tail(value) : 'Not set'}
      </span>
    </div>
  )
}

export function SyncPathsBand({
  paths,
  onChange
}: {
  paths: SyncPaths
  onChange: (key: SyncPathKey, value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const specs = PATH_SPECS(paths.connectorRoot)

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex h-7 flex-shrink-0 items-center gap-1.5 self-start rounded-md border border-hairline px-2.5 text-[11px] uppercase tracking-[0.08em] text-glyph-dim transition-colors hover:text-foreground"
      >
        Paths
        <ChevronDown className="h-3 w-3" />
      </button>
    )
  }

  const chrome = 'flex-shrink-0 rounded-xl border border-hairline bg-surface-panel'

  if (editing) {
    return (
      <div className={cn(chrome, 'flex flex-col gap-4 p-4')}>
        {specs.map((spec) => (
          <PathField key={spec.key} spec={spec} value={paths[spec.key]} onChange={onChange} />
        ))}
        <ValueField
          {...DEPLOYMENT_FIELD}
          value={paths.deploymentPath}
          onCommit={(value) => onChange('deploymentPath', value)}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing(false)}
            className="h-8 rounded-[9px] border-border-control bg-transparent px-3.5 text-xs text-zinc-300 shadow-none hover:bg-row-hover hover:text-foreground"
          >
            Done
          </Button>
        </div>
      </div>
    )
  }

  const divider: ReactNode = <span className="mx-3.5 h-5 w-px flex-shrink-0 bg-hairline" />

  return (
    <div className={cn(chrome, 'flex h-[46px] items-center pl-3.5 pr-1.5')}>
      <span className="mr-3.5 flex-shrink-0 text-[11px] uppercase tracking-[0.08em] text-glyph-dim">
        Paths
      </span>
      <BandSegment label="base" value={paths.connectorRoot} grow="flex-[1.2]" />
      {divider}
      <BandSegment label="source" value={paths.sourceFile} grow="flex-1" />
      {divider}
      <BandSegment label="local" value={paths.targetFile} grow="flex-1" />
      {divider}

      <BandSegment label="key" value={paths.deploymentPath} grow="flex-[0.8]" />
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="ml-3.5 h-[30px] flex-shrink-0 rounded-lg border border-border-control px-2.5 text-xs text-zinc-300 transition-colors hover:bg-row-hover hover:text-foreground"
      >
        Change…
      </button>
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        title="Collapse"
        aria-label="Collapse paths"
        className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg text-glyph-dim transition-colors hover:text-foreground"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

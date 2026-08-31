import { cn } from '@/lib/utils'
import { useFlash } from '@/lib/hooks/use-flash'
import { AdbCommand, Flow } from '@/types'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Loader2 } from 'lucide-react'
import { LuCheck, LuCopy, LuGripVertical, LuPencil, LuPlay, LuTrash2 } from 'react-icons/lu'

export type FlowRowStatus = 'idle' | 'queued' | 'running' | 'done'

export const FLOW_GRID = '26px 30px 84px 150px 116px 1fr 130px 152px'

const TYPE_STYLES: Record<string, { dot: string; label: string }> = {
  barcode: { dot: 'bg-type-barcode', label: 'text-type-barcode' },
  speech: { dot: 'bg-type-speech', label: 'text-type-speech' }
}

function StatusCell({ status }: { status: FlowRowStatus }) {
  if (status === 'running') {
    return <Loader2 className="animate-spin text-success" size={14} aria-label="Running" />
  }
  if (status === 'done') {
    return <LuCheck className="text-success" size={15} aria-label="Done" />
  }
  if (status === 'queued') {
    return (
      <span className="h-1.5 w-1.5 rounded-full border border-glyph-dimmer" aria-label="Queued" />
    )
  }
  return null
}

interface SortableCommandRowProps {
  command: AdbCommand
  flow: Flow
  status: FlowRowStatus
  onEditCommand: (flow: Flow, command: AdbCommand) => void
  onDeleteCommand: (flow: Flow, command: AdbCommand) => void
  onSendCommand: (command: AdbCommand) => void
  onCopyCommand: (flow: Flow, command: AdbCommand) => void

  canSend: boolean
}

export function SortableCommandRow({
  command,
  flow,
  status,
  onEditCommand,
  onDeleteCommand,
  onSendCommand,
  onCopyCommand,
  canSend
}: SortableCommandRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: command.id
  })
  const [sent, flashSent] = useFlash()
  const [copied, flashCopied] = useFlash()

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridTemplateColumns: FLOW_GRID,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative' as const
  }

  const copyValueToClipboard = () => {
    navigator.clipboard.writeText(command.value)
    flashCopied()
  }

  const handleSend = () => {
    onSendCommand(command)
    flashSent()
  }

  const typeStyle = TYPE_STYLES[command.type] ?? TYPE_STYLES.barcode

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group grid items-center border-b border-surface-control px-4 py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-row-hover',
        status === 'running' && 'bg-success/5'
      )}
    >
      <span
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-center text-glyph-dimmer hover:text-muted-foreground"
        aria-label="Drag to reorder"
      >
        <LuGripVertical size={15} />
      </span>
      <span className="flex items-center justify-center">
        <StatusCell status={status} />
      </span>
      <span className={`flex items-center gap-2 text-xs ${typeStyle.label}`}>
        <span className={`h-2 w-2 flex-shrink-0 rounded-[2px] ${typeStyle.dot}`} aria-hidden />
        {command.type}
      </span>

      <span className="truncate pr-3 font-medium text-foreground" title={command.name}>
        {command.name}
      </span>

      <span className="truncate pr-3 font-mono text-mono-keyword" title={command.keyword}>
        {command.keyword}
      </span>

      <span className="truncate pr-3 font-mono text-muted-foreground" title={command.value}>
        {command.value}
      </span>

      <span className="truncate pr-3 text-text-dim" title={command.description}>
        {command.description}
      </span>

      <span className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={() => onCopyCommand(flow, command)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
          aria-label="Duplicate command"
          title="Duplicate command"
        >
          <LuCopy size={16} />
        </button>
        <button
          type="button"
          onClick={copyValueToClipboard}
          className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
          aria-label="Copy value"
          title="Copy value"
        >
          {copied ? (
            <LuCheck size={16} className="text-success" />
          ) : (
            <>
              <LuCopy size={16} />
              <span className="absolute bottom-0.5 right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-mono-keyword text-[9px] font-bold leading-none text-surface-shell">
                V
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => onDeleteCommand(flow, command)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-red-400"
          aria-label="Remove command from flow"
          title="Remove command from flow"
        >
          <LuTrash2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => onEditCommand(flow, command)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
          aria-label="Edit command"
          title="Edit command"
        >
          <LuPencil size={16} />
        </button>
        {sent ? (
          <span
            className="flex h-7 w-7 items-center justify-center text-success"
            aria-label="Command sent"
          >
            <LuCheck size={16} />
          </span>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="flex h-7 w-7 items-center justify-center rounded-md text-success transition-colors hover:bg-success/15 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Run command"
            title={canSend ? 'Run command' : 'No target configured — see Settings → Target'}
          >
            <LuPlay size={16} />
          </button>
        )}
      </span>
    </div>
  )
}

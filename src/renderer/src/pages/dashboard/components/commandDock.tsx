import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useFlash } from '@/lib/hooks/use-flash'
import { useScrollMemory } from '@/lib/hooks/use-scroll-memory'
import { AdbCommand } from '@/types'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  LuCheck,
  LuChevronsLeft,
  LuChevronsRight,
  LuEllipsis,
  LuGripVertical,
  LuPlay,
  LuPlus
} from 'react-icons/lu'

interface CommandDockProps {
  commands: AdbCommand[] | undefined
  collapsed: boolean
  onToggleCollapsed: () => void
  handleAddCommand: (isCommon: boolean, inputValue?: string, type?: string) => void
  handleEditCommand: (command: AdbCommand | null, isCommon: boolean) => void
  handleShowDeleteModal: (command: AdbCommand) => void
  handleSendCommand: (command: AdbCommand) => void

  canSend: boolean
}

function DockRow({
  command,
  onEdit,
  onDelete,
  onSend,
  canSend
}: {
  command: AdbCommand
  onEdit: (command: AdbCommand) => void
  onDelete: (command: AdbCommand) => void
  onSend: (command: AdbCommand) => void
  canSend: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: command.keyword,
    data: { source: 'dock', command }
  })
  const [sent, flashSent] = useFlash()

  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative' as const
  }

  const handleSend = () => {
    onSend(command)
    flashSent()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 rounded-[10px] border border-border-control bg-surface-control px-3 py-2.5 transition-colors hover:border-muted-foreground/25"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          {...attributes}
          {...listeners}
          className="flex flex-shrink-0 cursor-grab items-center text-glyph-dimmer hover:text-muted-foreground"
          aria-label="Drag to reorder"
        >
          <LuGripVertical size={15} />
        </span>
        <span className="truncate text-sm font-medium text-foreground" title={command.name}>
          {command.name}
        </span>
      </span>

      <span className="flex flex-shrink-0 items-center gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
              aria-label={`More actions for ${command.name}`}
              title="More actions"
            >
              <LuEllipsis size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40" align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer" onClick={() => onEdit(command)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => onDelete(command)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

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
            aria-label={`Run ${command.name}`}
            title={canSend ? 'Run command' : 'No target configured — see Settings → Target'}
          >
            <LuPlay size={16} />
          </button>
        )}
      </span>
    </div>
  )
}

export function CommandDock({
  commands,
  collapsed,
  onToggleCollapsed,
  handleAddCommand,
  handleEditCommand,
  handleShowDeleteModal,
  handleSendCommand,
  canSend
}: CommandDockProps) {
  const bodyRef = useScrollMemory('dock')

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-8 w-8 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
          aria-label="Expand global commands dock"
          title="Expand global commands"
        >
          <LuChevronsLeft size={16} />
        </button>
      </div>
    )
  }

  const count = commands?.length ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-hairline px-4">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">Global commands</span>
          <span className="rounded-[5px] border border-border-control bg-surface-control px-1.5 py-px font-mono text-[11px] text-glyph-dim">
            {count}
          </span>
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => handleAddCommand(true, undefined, 'barcode')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
            aria-label="Add global command"
            title="Add global command"
          >
            <LuPlus size={16} />
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex h-7 w-7 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
            aria-label="Collapse global commands dock"
            title="Collapse dock"
          >
            <LuChevronsRight size={16} />
          </button>
        </span>
      </div>

      <div
        ref={bodyRef}
        className="min-h-0 flex-1 overflow-y-auto p-3"
        style={{ scrollbarGutter: 'stable' }}
      >
        {count === 0 ? (
          <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
            <p className="text-[13px] text-glyph-dim">No global commands yet</p>
            <p className="text-[11px] leading-snug text-glyph-dimmer">
              Available on every screen · run directly
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-1 gap-1"
              onClick={() => handleAddCommand(true, undefined, 'barcode')}
            >
              <LuPlus size={14} /> Add
            </Button>
          </div>
        ) : (
          <SortableContext
            items={commands!.map((command) => command.keyword)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {commands!.map((command) => (
                <DockRow
                  key={command.keyword}
                  command={command}
                  onEdit={(c) => handleEditCommand(c, true)}
                  onDelete={handleShowDeleteModal}
                  onSend={handleSendCommand}
                  canSend={canSend}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  )
}

import { AdbCommand } from '@/types'
import { useFlash } from '@/lib/hooks/use-flash'
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState } from 'react'
import { LuCheck, LuGripVertical, LuPencil, LuPlay, LuTrash2 } from 'react-icons/lu'

export type CommandTypeFilter = 'all' | 'barcode' | 'speech'

const GRID = '26px 96px 190px 130px 1fr 160px 96px'

interface CommandTableProps {
  commands: AdbCommand[] | undefined
  activeTypeFilter: CommandTypeFilter
  handleEditCommand: (command: AdbCommand | null, isCommon: boolean) => void
  handleShowDeleteModal: (command: AdbCommand) => void
  handleSendCommand: (command: AdbCommand) => void
  handleReorderCommands: (commands: AdbCommand[]) => void

  canSend: boolean
}

function withIds(commands: AdbCommand[] | undefined): AdbCommand[] {
  return (commands ?? []).map((command, index) =>
    command.id ? command : { ...command, id: `command-${command.keyword}-${index}` }
  )
}

const TYPE_STYLES: Record<string, { dot: string; label: string }> = {
  barcode: { dot: 'bg-type-barcode', label: 'text-type-barcode' },
  speech: { dot: 'bg-type-speech', label: 'text-type-speech' }
}

function SortableCommandRow({
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
    id: command.id
  })
  const [sent, flashSent] = useFlash()

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridTemplateColumns: GRID,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative' as const
  }

  const handleSend = () => {
    onSend(command)
    flashSent()
  }

  const typeStyle = TYPE_STYLES[command.type] ?? TYPE_STYLES.barcode

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group grid items-center border-b border-surface-control px-4 py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-row-hover"
    >
      <span
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-center text-glyph-dimmer hover:text-muted-foreground"
        aria-label="Drag to reorder"
      >
        <LuGripVertical size={15} />
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
          onClick={() => onDelete(command)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-red-400"
          aria-label="Delete command"
          title="Delete command"
        >
          <LuTrash2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => onEdit(command)}
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

export function CommandTable({
  commands,
  activeTypeFilter,
  handleEditCommand,
  handleShowDeleteModal,
  handleSendCommand,
  handleReorderCommands,
  canSend
}: CommandTableProps) {
  const [items, setItems] = useState<AdbCommand[]>(() => withIds(commands))

  useEffect(() => {
    setItems(withIds(commands))
  }, [commands])

  const matches = (command: AdbCommand) =>
    activeTypeFilter === 'all' || command.type === activeTypeFilter
  const visible = items.filter(matches)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = visible.findIndex((c) => c.id === active.id)
    const newIndex = visible.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newVisible = arrayMove(visible, oldIndex, newIndex)

    // Put reordered matches back without moving commands hidden by the filter.
    let vi = 0
    const full = items.map((command) => (matches(command) ? newVisible[vi++] : command))
    setItems(full)
    handleReorderCommands(full)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-panel">
      <div
        className="grid items-center border-b border-hairline px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-glyph-dim"
        style={{ gridTemplateColumns: GRID }}
      >
        <span aria-hidden />
        <span>Type</span>
        <span>Name</span>
        <span>Keyword</span>
        <span>Value</span>
        <span>Description</span>
        <span aria-hidden />
      </div>

      {visible.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <SortableContext items={visible.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {visible.map((command) => (
              <SortableCommandRow
                key={command.id}
                command={command}
                onEdit={(cmd) => handleEditCommand(cmd, false)}
                onDelete={handleShowDeleteModal}
                onSend={handleSendCommand}
                canSend={canSend}
              />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
          {activeTypeFilter === 'all' ? 'No commands yet' : `No ${activeTypeFilter} commands yet`}
        </div>
      )}
    </div>
  )
}

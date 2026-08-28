import { AdbCommand } from '@/types'
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
import { LuGripVertical, LuPencil, LuTrash2 } from 'react-icons/lu'
import { SETTINGS_BUTTON, SettingsDivider, SettingsRow } from './settingsSection'

// Settings' Common commands section (area 18b2) — the global command library, visible and editable in one place.

// drag · type · name · keyword · value · actions.
const GRID = '26px 84px 1fr 128px 1.3fr 68px'

const TYPE_STYLES: Record<string, { dot: string; label: string }> = {
  barcode: { dot: 'bg-type-barcode', label: 'text-type-barcode' },
  speech: { dot: 'bg-type-speech', label: 'text-type-speech' }
}

/** Stable id for dnd + React keys. */
function withIds(commands: AdbCommand[] | undefined): AdbCommand[] {
  return (commands ?? []).map((command, index) =>
    command.id ? command : { ...command, id: `common-${command.keyword}-${index}` }
  )
}

function CommonCommandRow({
  command,
  onEdit,
  onDelete
}: {
  command: AdbCommand
  onEdit: (command: AdbCommand) => void
  onDelete: (command: AdbCommand) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: command.id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridTemplateColumns: GRID,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative' as const
  }

  const typeStyle = TYPE_STYLES[command.type] ?? TYPE_STYLES.barcode

  return (
    <div
      ref={setNodeRef}
      style={style}
      // The description has no column of its own, so it carries here — the row
      // is the only place it can be read without opening the modal.
      title={command.description || undefined}
      // Rounded hover band, no per-row rule — Data's snapshot list (§1.11), not C4's full-bleed bordered rows.
      className="grid items-center rounded-lg px-2.5 py-2 text-[13px] transition-colors hover:bg-row-hover"
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

      <span className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={() => onDelete(command)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-red-400"
          aria-label={`Delete ${command.name || command.keyword}`}
          title="Delete command"
        >
          <LuTrash2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => onEdit(command)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
          aria-label={`Edit ${command.name || command.keyword}`}
          title="Edit command"
        >
          <LuPencil size={16} />
        </button>
      </span>
    </div>
  )
}

export function SettingsCommonCommands({
  commands,
  onAdd,
  onEdit,
  onDelete,
  onReorder
}: {
  commands: AdbCommand[] | undefined
  onAdd: () => void
  onEdit: (command: AdbCommand) => void
  onDelete: (command: AdbCommand) => void
  onReorder: (commands: AdbCommand[]) => void
}) {
  // Local mirror so a drag settles at 60fps rather than waiting on the config round-trip; re-seeded whenever the shell's copy changes...
  const [items, setItems] = useState<AdbCommand[]>(() => withIds(commands))

  useEffect(() => {
    setItems(withIds(commands))
  }, [commands])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((c) => c.id === active.id)
    const newIndex = items.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(items, oldIndex, newIndex)
    setItems(reordered)
    onReorder(reordered)
  }

  return (
    <>
      <SettingsRow
        label="Library"
        hint="Shown in the dock on every screen but this one. Order here is the dock's order."
      >
        <span className="rounded-[5px] border border-border-control bg-surface-control px-1.5 py-px font-mono text-[11px] text-glyph-dim">
          {items.length}
        </span>
        <button type="button" onClick={onAdd} className={SETTINGS_BUTTON}>
          Add…
        </button>
      </SettingsRow>

      <SettingsDivider />

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No global commands yet — add one here or from the dock on any other screen.
        </p>
      ) : (
        <div className="flex flex-col">
          {/* header — C4's mono uppercase caption row, minus the two columns
              this list doesn't carry */}
          <div
            className="grid items-center border-b border-hairline px-2.5 pb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-glyph-dim"
            style={{ gridTemplateColumns: GRID }}
          >
            <span aria-hidden />
            <span>Type</span>
            <span>Name</span>
            <span>Keyword</span>
            <span>Value</span>
            <span aria-hidden />
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {items.map((command) => (
                <CommonCommandRow
                  key={command.id}
                  command={command}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </>
  )
}

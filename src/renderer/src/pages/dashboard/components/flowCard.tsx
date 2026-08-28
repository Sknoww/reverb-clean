import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AdbCommand, Flow } from '@/types'
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
import {
  LuChevronDown,
  LuChevronRight,
  LuGripVertical,
  LuPencil,
  LuPlay,
  LuPlus,
  LuSquare,
  LuTrash2
} from 'react-icons/lu'
import { useFlowContext } from '../contexts/flowContext'
import { useShellDrag } from './shellDndContext'
import { FLOW_GRID, FlowRowStatus, SortableCommandRow } from './sortableCommandRow'

interface FlowCardProps {
  flow: Flow
  onDeleteFlow: (flow: Flow) => void
  onEditFlow: (flow: Flow) => void
  onRunFlow: (flow: Flow) => void
  onAddCommand: (flow: Flow) => void
  onCopyCommand: (flow: Flow, command: AdbCommand) => void
  onEditCommand: (flow: Flow, command: AdbCommand) => void
  onDeleteCommand: (flow: Flow, command: AdbCommand) => void
  onReorderCommands: (flow: Flow, commands: AdbCommand[]) => void
  onSendCommand: (command: AdbCommand) => void
  /** An intent action is configured (area 19) — Run is off without one, editing isn't. */
  canSend: boolean
  /** Body hidden, header only. Owned by `flowTab.tsx` so Collapse all can drive it. */
  collapsed: boolean
  onToggleCollapse: (flow: Flow) => void
}

// The card header is opaque so rows scroll *under* it (see the sticky wrapper below), which means the drop-target tint can't just be...
const DROP_TINT = 'bg-[linear-gradient(hsl(var(--primary)/0.05),hsl(var(--primary)/0.05))]'

export function FlowCard({
  flow,
  onDeleteFlow,
  onEditFlow,
  onAddCommand,
  onCopyCommand,
  onRunFlow,
  onEditCommand,
  onDeleteCommand,
  onSendCommand,
  onReorderCommands,
  canSend,
  collapsed,
  onToggleCollapse
}: FlowCardProps) {
  const { runningFlowId, isFlowRunning, runningCommandIndex } = useFlowContext()
  const isThisFlowRunning = isFlowRunning && runningFlowId === flow.id
  const bodyId = `flow-body-${flow.id}`

  const [localFlow, setLocalFlow] = useState<Flow>(flow)

  useEffect(() => {
    setLocalFlow(flow)
  }, [flow])

  // Card reorder (21a). The context this registers with is the *shell's*, not
  // the one below for command rows — see `shellDndContext.tsx`.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isCardDragging,
    isOver
  } = useSortable({ id: flow.id, data: { source: 'flow-card' } })

  // 21b: a sortable is already a droppable, so the card accepts a dock command without registering a second target.
  const { activeSource } = useShellDrag()
  const isCommandDropTarget = isOver && activeSource === 'dock'

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value
    if (value) {
      setLocalFlow((prev) => ({ ...prev, delay: parseInt(value) }))
    }
  }

  const commandsWithIds = localFlow.commands.map((command, index) => {
    return command.id ? command : { ...command, id: `command-${index}` }
  })

  const commandIds = commandsWithIds.map((command) => command.id)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = commandsWithIds.findIndex((command) => command.id === active.id)
      const newIndex = commandsWithIds.findIndex((command) => command.id === over.id)
      const newCommands = arrayMove(commandsWithIds, oldIndex, newIndex)
      setLocalFlow((prev) => ({ ...prev, commands: newCommands }))
      onReorderCommands(localFlow, newCommands)
    }
  }

  // Per-row status: rows before the running command are done, the running index
  // itself is running, later rows are queued. Only while THIS flow runs.
  const statusFor = (index: number): FlowRowStatus => {
    if (!isThisFlowRunning || runningCommandIndex === null) return 'idle'
    if (index < runningCommandIndex) return 'done'
    if (index === runningCommandIndex) return 'running'
    return 'queued'
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isCardDragging ? 0.5 : 1,
        zIndex: isCardDragging ? 10 : 0,
        position: 'relative'
      }}
      className={cn(
        // No `overflow-hidden` here — it would make this card the sticky header's containing block, pinning the header to a box that never scrolls...
        'w-full rounded-xl border border-hairline bg-surface-panel transition-colors',
        isThisFlowRunning && 'border-l-2 border-l-success',
        isCommandDropTarget && 'border-primary bg-primary/5'
      )}
    >
      {/* Header + column labels ride together in one sticky wrapper, so a long
          flow keeps its name, Run/Stop and column headings in view while its
          rows scroll past. One wrapper rather than two `sticky` elements: the
          second would need the first's height as a `top` offset, and that
          height varies with the running indicator. */}
      <div
        className={cn(
          'sticky top-0 z-10 rounded-t-xl bg-surface-panel',
          collapsed ? 'rounded-b-xl' : 'border-b border-hairline',
          isCommandDropTarget && DROP_TINT
        )}
      >
        {/* header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span
              {...attributes}
              {...listeners}
              className="-ml-1 flex flex-shrink-0 cursor-grab items-center text-glyph-dimmer transition-colors hover:text-muted-foreground"
              aria-label={`Drag to reorder ${localFlow.name}`}
              title="Drag to reorder"
            >
              <LuGripVertical size={16} />
            </span>
            {/* Collapse chevron + name are one control: the name is the biggest
                target on the row, and a card whose body is hidden has to be
                re-openable without hunting for a 28px glyph. */}
            <button
              type="button"
              onClick={() => onToggleCollapse(localFlow)}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              title={collapsed ? 'Expand flow' : 'Collapse flow'}
              className="-ml-0.5 flex items-center gap-1 rounded-md py-0.5 pl-0.5 pr-1 transition-colors hover:bg-row-hover"
            >
              <span className="flex flex-shrink-0 items-center text-glyph-dim">
                {collapsed ? <LuChevronRight size={15} /> : <LuChevronDown size={15} />}
              </span>
              <span className="text-[15px] font-semibold text-foreground">{localFlow.name}</span>
            </button>
            <span className="rounded-md border border-hairline px-2 py-0.5 font-mono text-[11px] text-glyph-dim">
              {commandsWithIds.length} step{commandsWithIds.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => onEditFlow(localFlow)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
              aria-label="Edit flow"
              title="Edit flow"
            >
              <LuPencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => onDeleteFlow(localFlow)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-red-400"
              aria-label="Delete flow"
              title="Delete flow"
            >
              <LuTrash2 size={15} />
            </button>
            {isThisFlowRunning && runningCommandIndex !== null && (
              <span className="ml-1 flex items-center gap-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                <span className="text-success">running</span>
                <span className="font-mono text-glyph-dim">
                  · step {runningCommandIndex + 1}/{commandsWithIds.length}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-glyph-dim">Delay</span>
              <Input
                id="delay"
                name="delay"
                value={localFlow.delay}
                className="h-8 w-[68px] border-border-control bg-surface-control px-2 text-center font-mono text-xs [appearance:textfield] md:text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="10"
                type="number"
                onChange={handleInputChange}
              />
              <span className="text-xs text-glyph-dim">ms</span>
            </div>
            {/* Run + Add — one joined segmented control (no gap between segments) */}
            <div className="flex items-center">
              <Button
                size="sm"
                onClick={() => onRunFlow?.(localFlow)}
                variant={isThisFlowRunning ? 'destructive' : 'default'}
                // A running flow can always be stopped, target or not — the run started before the target was cleared, and trapping it would be worse than...
                disabled={!canSend && !isThisFlowRunning}
                title={
                  canSend || isThisFlowRunning
                    ? undefined
                    : 'No target configured — see Settings → Target'
                }
                className="gap-1.5 rounded-r-none"
              >
                {isThisFlowRunning ? (
                  <>
                    <LuSquare size={14} /> Stop
                  </>
                ) : (
                  <>
                    <LuPlay size={14} /> Run
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAddCommand(localFlow)}
                className="gap-1 rounded-l-none border-l border-black/20"
              >
                <LuPlus size={14} /> Add
              </Button>
            </div>
          </div>
        </div>

        {/* column labels — shared C4 grid language + a leading status column */}
        {!collapsed && commandsWithIds.length > 0 && (
          <div
            className="grid items-center border-t border-hairline px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-glyph-dim"
            style={{ gridTemplateColumns: FLOW_GRID }}
          >
            <span aria-hidden />
            <span aria-hidden />
            <span>Type</span>
            <span>Name</span>
            <span>Keyword</span>
            <span>Value</span>
            <span>Description</span>
            <span aria-hidden />
          </div>
        )}
      </div>

      {/* Command list. No height cap and no `overflow` — every flow card used to
          be its own scroll container, which meant a wheel gesture over a card
          was captured by that card and never reached the page. The screen has
          one scroller now, and a flow too long to sit in it collapses instead. */}
      {!collapsed && (
        <div id={bodyId} className="overflow-hidden rounded-b-xl">
          {commandsWithIds.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext items={commandIds} strategy={verticalListSortingStrategy}>
                {commandsWithIds.map((command, index) => (
                  <SortableCommandRow
                    key={command.id}
                    command={command}
                    flow={localFlow}
                    status={statusFor(index)}
                    onCopyCommand={onCopyCommand}
                    onEditCommand={onEditCommand}
                    onDeleteCommand={onDeleteCommand}
                    onSendCommand={onSendCommand}
                    canSend={canSend}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              No commands yet — use <span className="text-foreground">Add Command</span> to build
              this flow.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

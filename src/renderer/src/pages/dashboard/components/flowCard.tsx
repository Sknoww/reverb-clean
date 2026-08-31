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

  canSend: boolean

  collapsed: boolean
  onToggleCollapse: (flow: Flow) => void
}

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

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isCardDragging,
    isOver
  } = useSortable({ id: flow.id, data: { source: 'flow-card' } })

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
        // overflow-hidden would trap the sticky header inside this card.
        'w-full rounded-xl border border-hairline bg-surface-panel transition-colors',
        isThisFlowRunning && 'border-l-2 border-l-success',
        isCommandDropTarget && 'border-primary bg-primary/5'
      )}
    >
      <div
        className={cn(
          'sticky top-0 z-10 rounded-t-xl bg-surface-panel',
          collapsed ? 'rounded-b-xl' : 'border-b border-hairline',
          isCommandDropTarget && DROP_TINT
        )}
      >
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

            <div className="flex items-center">
              <Button
                size="sm"
                onClick={() => onRunFlow?.(localFlow)}
                variant={isThisFlowRunning ? 'destructive' : 'default'}
                // A running flow must remain stoppable if the target is cleared.
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

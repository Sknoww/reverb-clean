import { AdbCommand, Flow } from '@/types'
import {
  closestCenter,
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { createContext, ReactNode, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuGripVertical } from 'react-icons/lu'

export type ShellDragData = { source: 'dock'; command: AdbCommand } | { source: 'flow-card' }

function dragData(data: unknown): ShellDragData | undefined {
  return data as ShellDragData | undefined
}

interface ShellDragState {
  activeSource: ShellDragData['source'] | null
}

const ShellDragContext = createContext<ShellDragState>({ activeSource: null })

export function useShellDrag() {
  return useContext(ShellDragContext)
}

// Pointer hits beat center distance when dock rows can be dropped on tall flow cards.
const dockCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args)
  return collisions.length > 0 ? collisions : closestCenter(args)
}

export function ShellDndProvider({
  commonCommands,
  flows,
  onReorderCommonCommands,
  onReorderFlows,
  onDropCommandOnFlow,
  children
}: {
  commonCommands: AdbCommand[] | undefined
  flows: Flow[]
  onReorderCommonCommands: (commands: AdbCommand[]) => void
  onReorderFlows: (flows: Flow[]) => void
  onDropCommandOnFlow: (flow: Flow, command: AdbCommand) => void
  children: ReactNode
}) {
  const [activeSource, setActiveSource] = useState<ShellDragData['source'] | null>(null)
  const [activeCommand, setActiveCommand] = useState<AdbCommand | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const clearActive = () => {
    setActiveSource(null)
    setActiveCommand(null)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const data = dragData(event.active.data.current)
    setActiveSource(data?.source ?? null)
    setActiveCommand(data?.source === 'dock' ? data.command : null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const data = dragData(active.data.current)
    clearActive()
    if (!over || active.id === over.id) return

    if (data?.source === 'dock') {
      const targetFlow = flows.find((flow) => flow.id === over.id)
      if (targetFlow) {
        onDropCommandOnFlow(targetFlow, data.command)
        return
      }
      if (!commonCommands) return
      const oldIndex = commonCommands.findIndex((command) => command.keyword === active.id)
      const newIndex = commonCommands.findIndex((command) => command.keyword === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      onReorderCommonCommands(arrayMove(commonCommands, oldIndex, newIndex))
      return
    }

    if (data?.source === 'flow-card') {
      const oldIndex = flows.findIndex((flow) => flow.id === active.id)
      const newIndex = flows.findIndex((flow) => flow.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      onReorderFlows(arrayMove(flows, oldIndex, newIndex))
    }
  }

  return (
    <ShellDragContext.Provider value={{ activeSource }}>
      <DndContext
        sensors={sensors}
        collisionDetection={activeSource === 'dock' ? dockCollisionDetection : closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={clearActive}
        modifiers={activeSource === 'flow-card' ? [restrictToVerticalAxis] : undefined}
      >
        {children}
        {/* Portal the preview so the dock's scroll container cannot clip it. */}
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {activeCommand ? (
              <div className="flex cursor-grabbing items-center gap-2.5 rounded-[10px] border border-primary/60 bg-surface-control px-3 py-2.5 shadow-lg">
                <LuGripVertical size={15} className="flex-shrink-0 text-glyph-dimmer" />
                <span className="truncate text-sm font-medium text-foreground">
                  {activeCommand.name}
                </span>
              </div>
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </ShellDragContext.Provider>
  )
}

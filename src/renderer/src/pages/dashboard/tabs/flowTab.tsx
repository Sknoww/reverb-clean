import { useScrollMemory } from '@/lib/hooks/use-scroll-memory'
import { useSessionState } from '@/lib/hooks/use-session-state'
import { AdbCommand, Flow, Project } from '@/types'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { LuChevronsDownUp, LuChevronsUpDown } from 'react-icons/lu'
import { FlowCard } from '../components/flowCard'
import { TARGET_MESSAGES, TargetNotice } from '../components/targetNotice'

/** Stable empty set, so the initial value isn't a fresh allocation per render. */
const NONE_COLLAPSED: ReadonlySet<string> = new Set()

interface FlowTabProps {
  project: Project | null
  handleEditFlow: (flow: Flow) => void
  handleShowDeleteModal: (flow: Flow) => void
  handleSendFlow: (flow: Flow) => void
  handleSendFlowCommand: (command: AdbCommand) => void
  handleAddCommandToFlow: (flow: Flow) => void
  handleCopyFlowCommand: (flow: Flow, command: AdbCommand) => void
  handleEditFlowCommand: (flow: Flow, command: AdbCommand) => void
  handleDeleteFlowCommand: (flow: Flow, command: AdbCommand) => void
  handleReorderFlowCommands: (flow: Flow, commands: AdbCommand[]) => void
  /** An intent action is configured (area 19). Building a flow never needs one. */
  canSend: boolean
}

export function FlowTab({
  project,
  handleEditFlow,
  handleShowDeleteModal,
  handleSendFlow,
  handleSendFlowCommand,
  handleAddCommandToFlow,
  handleCopyFlowCommand,
  handleEditFlowCommand,
  handleDeleteFlowCommand,
  handleReorderFlowCommands,
  canSend
}: FlowTabProps) {
  // Replaces a first-mount `scrollTop = 0`: pinning the list to the top was only ever the *right* answer on the first visit, and this still...
  const listRef = useScrollMemory('flows')

  // Which cards are collapsed, by flow id.
  const [collapsedIds, setCollapsedIds] = useSessionState<ReadonlySet<string>>(
    'flows.collapsed',
    NONE_COLLAPSED
  )

  const toggleCollapsed = (flow: Flow) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (!next.delete(flow.id)) next.add(flow.id)
      return next
    })
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-1">
        <div className="max-w-sm space-y-3 text-center">
          <h3 className="text-lg font-medium">No Project Selected</h3>
          <p className="text-sm text-muted-foreground">
            Select an existing project or create a new one to start creating flows.
          </p>
          <p className="text-xs text-muted-foreground">
            Use the project dropdown in the top-left corner to get started.
          </p>
        </div>
      </div>
    )
  }

  if (project.flows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-1">
        <div className="max-w-sm space-y-3 text-center">
          <h3 className="text-lg font-medium">No Flows Yet</h3>
          <p className="text-sm text-muted-foreground">
            A flow runs a sequence of commands in order, with a delay between each.
          </p>
          <p className="text-xs text-muted-foreground">
            Use <span className="text-foreground">New Flow</span> in the top bar to create one.
          </p>
        </div>
      </div>
    )
  }

  const allCollapsed = project.flows.every((flow) => collapsedIds.has(flow.id))

  const setAllCollapsed = (collapsed: boolean) =>
    setCollapsedIds(collapsed ? new Set(project.flows.map((flow) => flow.id)) : NONE_COLLAPSED)

  return (
    <div className="flex h-full flex-col">
      {/* Same placement rule as Commands (19a): flows stay readable and editable
          with no target; only the runs are off. */}
      {!canSend && (
        <div className="flex-shrink-0 pb-3 pt-1">
          <TargetNotice message={TARGET_MESSAGES.commands} />
        </div>
      )}

      {/* List toolbar — the same slot and metrics as the Commands screen's filter-chip row. */}
      <div className="flex flex-shrink-0 items-center gap-2 pb-3 pt-1">
        <span className="select-none text-xs text-glyph-dim">
          <span className="font-mono">{project.flows.length}</span>{' '}
          {project.flows.length === 1 ? 'flow' : 'flows'}
        </span>
        <button
          type="button"
          onClick={() => setAllCollapsed(!allCollapsed)}
          title={allCollapsed ? 'Expand every flow' : 'Collapse every flow'}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {allCollapsed ? <LuChevronsUpDown size={13} /> : <LuChevronsDownUp size={13} />}
          {allCollapsed ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto pb-4 pr-1"
        style={{ scrollbarGutter: 'stable' }}
      >
        {/* Card order is persisted (21a); the `DndContext` is the shell's, so a
            dock command can be dropped onto a card without leaving it. */}
        <SortableContext
          items={project.flows.map((flow) => flow.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-4 pt-1">
            {project.flows.map((flow) => (
              <FlowCard
                flow={flow}
                key={flow.id}
                onDeleteFlow={handleShowDeleteModal}
                onEditFlow={handleEditFlow}
                onRunFlow={handleSendFlow}
                onAddCommand={handleAddCommandToFlow}
                onCopyCommand={handleCopyFlowCommand}
                onEditCommand={handleEditFlowCommand}
                onDeleteCommand={handleDeleteFlowCommand}
                onReorderCommands={handleReorderFlowCommands}
                onSendCommand={handleSendFlowCommand}
                canSend={canSend}
                collapsed={collapsedIds.has(flow.id)}
                onToggleCollapse={toggleCollapsed}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

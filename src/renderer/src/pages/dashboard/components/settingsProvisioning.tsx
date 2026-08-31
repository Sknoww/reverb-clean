import { ProvisionConfig, ProvisionStep } from '@/types'
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
import { DeleteModal } from './deleteModal'
import { ProvisionStepModal } from './provisionStepModal'
import { describeStep, ProvisionTypeIcon, stepFlags } from './provisionStepMeta'
import { PathField, PathSpec } from './syncPaths'
import { SETTINGS_BUTTON, SettingsDivider, SettingsRow } from './settingsSection'

const GRID = '26px 78px 1fr 68px'

const SOURCE_ROOT_SPEC: PathSpec<'sourceRoot'> = {
  key: 'sourceRoot',
  label: 'Source root',
  hint: 'what a relative push source resolves against',

  pick: () => window.dialogAPI.selectFolder('Select the provisioning source root')
}

function StepRow({
  step,
  onEdit,
  onDelete
}: {
  step: ProvisionStep
  onEdit: (step: ProvisionStep) => void
  onDelete: (step: ProvisionStep) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridTemplateColumns: GRID,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative' as const
  }

  const derived = describeStep(step)
  const flags = stepFlags(step)
  const name = step.label || derived

  return (
    <div
      ref={setNodeRef}
      style={style}
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

      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <ProvisionTypeIcon type={step.type} className="text-glyph-dim" />
        {step.type}
      </span>
      <span className="flex min-w-0 items-center gap-2 pr-3">
        {step.label ? (
          <>
            <span className="truncate text-foreground" title={step.label}>
              {step.label}
            </span>
            <span className="truncate font-mono text-xs text-glyph-dim" title={derived}>
              {derived}
            </span>
          </>
        ) : (
          <span className="truncate font-mono text-xs text-foreground" title={derived}>
            {derived}
          </span>
        )}
        {flags.map((flag) => (
          <span
            key={flag}
            className="flex-shrink-0 rounded-[5px] border border-border-control px-1.5 py-px font-mono text-[10px] text-glyph-dim"
          >
            {flag}
          </span>
        ))}
      </span>

      <span className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={() => onDelete(step)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-red-400"
          aria-label={`Delete step ${name}`}
          title="Delete step"
        >
          <LuTrash2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
          aria-label={`Edit step ${name}`}
          title="Edit step"
        >
          <LuPencil size={16} />
        </button>
      </span>
    </div>
  )
}

export function ProvisioningSettings({
  provision,
  onChanged
}: {
  provision: ProvisionConfig

  onChanged: () => Promise<void> | void
}) {
  const [steps, setSteps] = useState<ProvisionStep[]>(provision.steps)
  const [editing, setEditing] = useState<{ step: ProvisionStep | null } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ProvisionStep | null>(null)

  useEffect(() => {
    setSteps(provision.steps)
  }, [provision.steps])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const commit = async (next: ProvisionStep[]) => {
    setSteps(next)
    await window.configAPI.updateProvisionConfig({ steps: next })
    await onChanged()
  }

  const handleSourceRoot = async (_key: 'sourceRoot', value: string) => {
    await window.configAPI.updateProvisionConfig({ sourceRoot: value })
    await onChanged()
  }

  const handleSave = (step: ProvisionStep) => {
    const exists = steps.some((existing) => existing.id === step.id)
    void commit(
      exists
        ? steps.map((existing) => (existing.id === step.id ? step : existing))
        : [...steps, step]
    )
    setEditing(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = steps.findIndex((step) => step.id === active.id)
    const newIndex = steps.findIndex((step) => step.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    void commit(arrayMove(steps, oldIndex, newIndex))
  }

  return (
    <>
      <PathField
        spec={SOURCE_ROOT_SPEC}
        value={provision.sourceRoot}
        onChange={(key, value) => void handleSourceRoot(key, value)}
      />

      <SettingsDivider />

      <SettingsRow
        label="Steps"
        hint="Run in order after the storage wipe and before the relaunch. A failed step stops the routine and leaves the client stopped."
      >
        <span className="rounded-[5px] border border-border-control bg-surface-control px-1.5 py-px font-mono text-[11px] text-glyph-dim">
          {steps.length}
        </span>
        <button
          type="button"
          onClick={() => setEditing({ step: null })}
          className={SETTINGS_BUTTON}
        >
          Add step…
        </button>
      </SettingsRow>

      <SettingsDivider />

      {steps.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No steps — Clear client storage wipes and relaunches, exactly as it did before. Add one to
          put the device back into a working state on the way through.
        </p>
      ) : (
        <div className="flex flex-col">
          <div
            className="grid items-center border-b border-hairline px-2.5 pb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-glyph-dim"
            style={{ gridTemplateColumns: GRID }}
          >
            <span aria-hidden />
            <span>Type</span>
            <span>Step</span>
            <span aria-hidden />
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext
              items={steps.map((step) => step.id)}
              strategy={verticalListSortingStrategy}
            >
              {steps.map((step) => (
                <StepRow
                  key={step.id}
                  step={step}
                  onEdit={(target) => setEditing({ step: target })}
                  onDelete={setPendingDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {editing && (
        <ProvisionStepModal
          isOpen={true}
          step={editing.step}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      <DeleteModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void commit(steps.filter((step) => step.id !== pendingDelete.id))
          setPendingDelete(null)
        }}
        title="Delete Provisioning Step"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.label || describeStep(pendingDelete)}"? This can't be undone.`
            : ''
        }
      />
    </>
  )
}

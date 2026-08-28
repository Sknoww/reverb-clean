import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ProvisionStep, ProvisionStepType } from '@/types'
import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import {
  Field,
  FIELD_ERROR_BORDER,
  FIELD_INPUT,
  FIELD_INPUT_MONO,
  FIELD_TEXTAREA,
  MODAL_CONTENT,
  MODAL_FORM,
  ModalBody,
  ModalFooter,
  ModalHeader
} from './modalShell'
import { PROVISION_TYPES, ProvisionTypeIcon } from './provisionStepMeta'

// The provisioning step editor (area 28b1), on C7's shared chrome (§1.8) like the command and flow modals.

/** A superset draft: switching type keeps what the other types can't hold. */
interface StepDraft {
  id: string
  type: ProvisionStepType
  label: string
  command: string
  continueOnError: boolean
  source: string
  destination: string
  sync: boolean
  permissions: string
  durationMs: string
}

/** Mirrors `PROVISION_WAIT_BOUNDS` in configManager. */
const WAIT_BOUNDS = { min: 0, max: 600_000 }

const emptyDraft = (): StepDraft => ({
  id: uuid(),
  type: 'shell',
  label: '',
  command: '',
  continueOnError: false,
  source: '',
  destination: '',
  sync: false,
  permissions: '',
  durationMs: '1000'
})

/** A step back into the flat draft. */
function toDraft(step: ProvisionStep): StepDraft {
  const draft = { ...emptyDraft(), id: step.id, type: step.type, label: step.label ?? '' }

  switch (step.type) {
    case 'shell':
      return { ...draft, command: step.command, continueOnError: step.continueOnError === true }
    case 'push':
      return {
        ...draft,
        source: step.source,
        destination: step.destination,
        sync: step.sync === true
      }
    case 'grant':
      // One per line in the editor, one array in config — a permission is a long
      // dotted string and a comma-separated row of them is unreadable.
      return { ...draft, permissions: step.permissions.join('\n') }
    case 'wait':
      return { ...draft, durationMs: String(step.durationMs) }
  }
}

const permissionList = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/** The one condition per type that main would drop the step for. */
function validate(draft: StepDraft): Partial<Record<keyof StepDraft, string>> {
  switch (draft.type) {
    case 'shell':
      return draft.command.trim() ? {} : { command: 'A shell step needs a command line.' }
    case 'push':
      return {
        ...(draft.source.trim() ? {} : { source: 'A push needs a source path.' }),
        ...(draft.destination.trim()
          ? {}
          : { destination: 'A push needs a destination on the device.' })
      }
    case 'grant':
      return permissionList(draft.permissions).length > 0
        ? {}
        : { permissions: 'A grant step needs at least one permission.' }
    case 'wait':
      return Number.isNaN(Number.parseInt(draft.durationMs, 10))
        ? { durationMs: 'Enter a duration in milliseconds.' }
        : {}
  }
}

/** The draft narrowed back to the union — only ever called on a valid draft. */
function toStep(draft: StepDraft): ProvisionStep {
  const base = { id: draft.id, ...(draft.label.trim() ? { label: draft.label.trim() } : {}) }

  switch (draft.type) {
    case 'shell':
      return {
        ...base,
        type: 'shell',
        command: draft.command.trim(),
        ...(draft.continueOnError ? { continueOnError: true } : {})
      }
    case 'push':
      return {
        ...base,
        type: 'push',
        source: draft.source.trim(),
        destination: draft.destination.trim(),
        ...(draft.sync ? { sync: true } : {})
      }
    case 'grant':
      return { ...base, type: 'grant', permissions: permissionList(draft.permissions) }
    case 'wait':
      return {
        ...base,
        type: 'wait',
        durationMs: Math.min(
          WAIT_BOUNDS.max,
          Math.max(WAIT_BOUNDS.min, Number.parseInt(draft.durationMs, 10))
        )
      }
  }
}

/** A labelled checkbox for the two per-step flags. */
function FlagField({
  id,
  checked,
  onChange,
  label,
  hint
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-primary"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] text-foreground">{label}</span>
        <span className="text-xs leading-snug text-glyph-dim">{hint}</span>
      </span>
    </label>
  )
}

export function ProvisionStepModal({
  isOpen,
  step,
  onClose,
  onSave
}: {
  isOpen: boolean
  /** The step being edited, or null for a new one. */
  step: ProvisionStep | null
  onClose: () => void
  onSave: (step: ProvisionStep) => void
}) {
  const [draft, setDraft] = useState<StepDraft>(() => (step ? toDraft(step) : emptyDraft()))
  // Errors appear on submit, not per keystroke — a required field is not a
  // mistake until you try to save. Editing one clears its own message (C7).
  const [errors, setErrors] = useState<Partial<Record<keyof StepDraft, string>>>({})

  useEffect(() => {
    if (isOpen) {
      setDraft(step ? toDraft(step) : emptyDraft())
      setErrors({})
    }
  }, [isOpen, step])

  const set = <K extends keyof StepDraft>(key: K, value: StepDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const found = validate(draft)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }
    onSave(toStep(draft))
  }

  const isEditing = step !== null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={MODAL_CONTENT} showCloseButton={false}>
        <form onSubmit={handleSubmit} className={MODAL_FORM}>
          <ModalHeader
            marker={<ProvisionTypeIcon type={draft.type} className="text-accent-indigo" />}
            title={`${isEditing ? 'Edit' : 'New'} provisioning step`}
            onClose={onClose}
          />
          <DialogDescription className="sr-only">
            {isEditing ? 'Edit a provisioning step' : 'Add a step to the provisioning routine'}
          </DialogDescription>

          <ModalBody>
            <Field label="Type">
              <div className="flex gap-1.5 rounded-[10px] border border-hairline bg-surface-chrome p-1">
                {PROVISION_TYPES.map(({ value, label }) => {
                  const active = draft.type === value
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => set('type', value)}
                      className={cn(
                        'flex h-[34px] flex-1 items-center justify-center gap-[7px] rounded-[7px] text-[13px] transition-colors',
                        active
                          ? 'bg-nav-active font-medium text-foreground'
                          : 'text-text-dim hover:text-foreground'
                      )}
                    >
                      <ProvisionTypeIcon
                        type={value}
                        size={13}
                        className={active ? 'text-foreground' : 'text-glyph-dimmer'}
                      />
                      {label}
                    </button>
                  )
                })}
              </div>
            </Field>

            {draft.type === 'shell' && (
              <>
                <Field
                  htmlFor="provision-command"
                  label="Command"
                  error={errors.command ?? null}
                  hint="Runs through `adb shell` on the selected device, exactly as written."
                >
                  <Input
                    id="provision-command"
                    value={draft.command}
                    onChange={(event) => set('command', event.target.value)}
                    placeholder="mkdir -p /sdcard/artifacts"
                    className={cn(FIELD_INPUT_MONO, errors.command && FIELD_ERROR_BORDER)}
                    aria-invalid={Boolean(errors.command)}
                  />
                </Field>

                <FlagField
                  id="provision-continue"
                  checked={draft.continueOnError}
                  onChange={(checked) => set('continueOnError', checked)}
                  label="Keep going if this step fails"
                  // The reason this flag exists at all, stated where it's set.
                  hint="For steps that fail harmlessly — `mkdir` on a directory that already exists. Every other failure stops the routine before the relaunch."
                />
              </>
            )}

            {draft.type === 'push' && (
              <>
                <Field
                  htmlFor="provision-source"
                  label="Source"
                  error={errors.source ?? null}
                  hint="On this machine. A relative path resolves against the source root above."
                >
                  <Input
                    id="provision-source"
                    value={draft.source}
                    onChange={(event) => set('source', event.target.value)}
                    placeholder="artifacts/"
                    className={cn(FIELD_INPUT_MONO, errors.source && FIELD_ERROR_BORDER)}
                    aria-invalid={Boolean(errors.source)}
                  />
                </Field>

                <Field
                  htmlFor="provision-destination"
                  label="Destination"
                  error={errors.destination ?? null}
                  hint="On the device."
                >
                  <Input
                    id="provision-destination"
                    value={draft.destination}
                    onChange={(event) => set('destination', event.target.value)}
                    placeholder="/sdcard/artifacts/"
                    className={cn(FIELD_INPUT_MONO, errors.destination && FIELD_ERROR_BORDER)}
                    aria-invalid={Boolean(errors.destination)}
                  />
                </Field>

                <FlagField
                  id="provision-sync"
                  checked={draft.sync}
                  onChange={(checked) => set('sync', checked)}
                  label="Skip files already on the device"
                  // Off by default in the type for this reason; the field says it
                  // rather than leaving the fast path looking free.
                  hint="`adb push --sync` — seconds instead of minutes on a re-push, but it trusts timestamps. A file rebuilt without its mtime moving is silently not pushed."
                />
              </>
            )}

            {draft.type === 'grant' && (
              <Field
                htmlFor="provision-permissions"
                label="Permissions"
                error={errors.permissions ?? null}
                hint="One per line, granted to the configured target package. Each is attempted even if an earlier one fails."
              >
                <Textarea
                  id="provision-permissions"
                  value={draft.permissions}
                  onChange={(event) => set('permissions', event.target.value)}
                  placeholder={'android.permission.CAMERA\nandroid.permission.RECORD_AUDIO'}
                  className={cn(
                    FIELD_TEXTAREA,
                    'h-[104px] min-h-[104px] font-mono',
                    errors.permissions && FIELD_ERROR_BORDER
                  )}
                  aria-invalid={Boolean(errors.permissions)}
                />
              </Field>
            )}

            {draft.type === 'wait' && (
              <Field
                htmlFor="provision-duration"
                label="Duration"
                error={errors.durationMs ?? null}
                hint="A wall-clock pause. Runs no process, so the provisioning timeout doesn't apply to it."
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="provision-duration"
                    inputMode="numeric"
                    value={draft.durationMs}
                    onChange={(event) => set('durationMs', event.target.value)}
                    className={cn(
                      FIELD_INPUT_MONO,
                      'w-[120px] text-right',
                      errors.durationMs && FIELD_ERROR_BORDER
                    )}
                    aria-invalid={Boolean(errors.durationMs)}
                  />
                  <span className="text-xs text-glyph-dim">ms</span>
                </div>
              </Field>
            )}

            {/* Last, and optional on every type: without one the step describes
                itself from its own fields, which is usually clearer than a name
                someone had to invent — and can't go stale against the command it
                names. Progress and the failure report use whatever this is. */}
            <Field
              htmlFor="provision-label"
              label="Label"
              optional
              hint="What progress and the failure report call this step."
            >
              <Input
                id="provision-label"
                value={draft.label}
                onChange={(event) => set('label', event.target.value)}
                placeholder="Push workflow artifacts"
                className={FIELD_INPUT}
              />
            </Field>
          </ModalBody>

          <ModalFooter onCancel={onClose} submitLabel={isEditing ? 'Save changes' : 'Add step'} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

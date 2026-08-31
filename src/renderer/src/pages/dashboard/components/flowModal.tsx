import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Flow } from '@/types'
import { useEffect, useState } from 'react'
import { LuArrowRightLeft, LuInfo } from 'react-icons/lu'
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

interface FlowModalProps {
  isOpen: boolean
  onClose: () => void
  flow?: Flow | null
  onSave: (flow: Flow, isNewFlow: boolean) => void
  title?: string
  error?: boolean

  defaultDelay: number
}

export function FlowModal({
  isOpen,
  onClose,
  flow = null,
  onSave,
  title = 'flow',
  error,
  defaultDelay
}: FlowModalProps) {
  const makeDefaultFlow = (): Flow => ({
    id: uuid(),
    name: '',
    description: '',
    commands: [],
    delay: defaultDelay
  })

  const [editedFlow, setEditedFlow] = useState<Flow>(flow || makeDefaultFlow())

  const [delayText, setDelayText] = useState(String(defaultDelay))

  const [nameEdited, setNameEdited] = useState(false)
  const isNewflow = !flow

  useEffect(() => {
    const next = flow ?? makeDefaultFlow()
    setEditedFlow(next)
    setDelayText(String(next.delay ?? defaultDelay))
    setNameEdited(false)
  }, [flow, isOpen, defaultDelay])

  useEffect(() => {
    if (error) setNameEdited(false)
  }, [error])

  const showNameError = Boolean(error) && !nameEdited

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'name') setNameEdited(true)
    setEditedFlow((prev) => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setNameEdited(false)
    const delay = Number.parseInt(delayText, 10)
    onSave({ ...editedFlow, delay: Number.isNaN(delay) ? 0 : delay }, isNewflow)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={MODAL_CONTENT} showCloseButton={false}>
        <form onSubmit={handleSubmit} className={MODAL_FORM}>
          <ModalHeader
            marker={<LuArrowRightLeft size={14} className="text-accent-indigo" aria-hidden />}
            title={`${isNewflow ? 'New' : 'Edit'} ${title}`}
            onClose={onClose}
          />
          <DialogDescription className="sr-only">
            {isNewflow ? 'Enter flow details' : 'Edit flow details'}
          </DialogDescription>

          <ModalBody>
            <Field
              htmlFor="name"
              label="Name"
              error={
                showNameError
                  ? 'A flow with this name already exists. Choose a different name.'
                  : null
              }
            >
              <Input
                id="name"
                name="name"
                value={editedFlow.name}
                onChange={handleInputChange}
                className={`${FIELD_INPUT} ${showNameError ? FIELD_ERROR_BORDER : ''}`}
                aria-invalid={showNameError}
                aria-describedby={showNameError ? 'name-error' : undefined}
                required
              />
            </Field>

            <Field htmlFor="delay" label="Inter-command delay">
              <div className="flex items-center gap-2.5">
                <Input
                  id="delay"
                  name="delay"
                  type="number"
                  min={0}
                  value={delayText}
                  onChange={(e) => setDelayText(e.target.value)}
                  className={`${FIELD_INPUT_MONO} w-[120px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                  required
                />
                <span className="text-[13px] text-text-dim">ms between each command</span>
              </div>
            </Field>

            <Field htmlFor="description" label="Description" optional>
              <Textarea
                id="description"
                name="description"
                value={editedFlow.description}
                onChange={handleInputChange}
                className={`${FIELD_TEXTAREA} h-[92px] min-h-[92px]`}
              />
            </Field>

            {isNewflow && (
              <div className="flex items-center gap-2 rounded-[9px] border border-hairline bg-surface-panel px-3 py-2.5 text-xs text-glyph-dim">
                <LuInfo size={13} className="flex-shrink-0 text-accent-indigo" aria-hidden />
                Add commands to this flow from the flow card after creating it.
              </div>
            )}
          </ModalBody>

          <ModalFooter onCancel={onClose} submitLabel={isNewflow ? 'Create' : 'Save changes'} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

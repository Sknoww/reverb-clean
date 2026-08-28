import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AdbCommand } from '@/types'
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

const defaultCommand: AdbCommand = {
  id: uuid(),
  name: '',
  type: 'barcode',
  keyword: '',
  value: '',
  description: ''
}

const TYPES = [
  { value: 'barcode', label: 'Barcode' },
  { value: 'speech', label: 'Speech' }
] as const

interface CommandModalProps {
  isOpen: boolean
  onClose: () => void
  command?: AdbCommand | null
  onSave: (command: AdbCommand, previousCommand?: AdbCommand | null) => void
  isEditing?: boolean
  title?: string
  error?: boolean
}

export function CommandModal({
  isOpen,
  onClose,
  command = null,
  onSave,
  isEditing = false,
  title = 'command',
  error
}: CommandModalProps) {
  const [editedCommand, setEditedCommand] = useState<AdbCommand>(command || { ...defaultCommand })
  // The duplicate-keyword error is owned by Dashboard and only clears on save or close, so it would otherwise sit under a keyword the user...
  const [keywordEdited, setKeywordEdited] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setEditedCommand(command || { ...defaultCommand, id: uuid() })
      setKeywordEdited(false)
    }
  }, [command, isOpen])

  useEffect(() => {
    if (error) setKeywordEdited(false)
  }, [error])

  const showKeywordError = Boolean(error) && !keywordEdited

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'keyword') setKeywordEdited(true)
    setEditedCommand((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setKeywordEdited(false)
    onSave(editedCommand, isEditing ? command : null)
  }

  const setCommandType = (type: string) => {
    setEditedCommand((prev) => ({ ...prev, type }))
  }

  const typeDot = editedCommand.type === 'speech' ? 'bg-type-speech' : 'bg-type-barcode'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={MODAL_CONTENT} showCloseButton={false}>
        <form onSubmit={handleSubmit} className={MODAL_FORM}>
          <ModalHeader
            marker={<span className={`h-2 w-2 rounded-[2px] ${typeDot}`} aria-hidden />}
            title={`${isEditing ? 'Edit' : 'New'} ${title}`}
            onClose={onClose}
          />
          <DialogDescription className="sr-only">
            {isEditing ? 'Edit command details' : 'Enter command details'}
          </DialogDescription>

          <ModalBody>
            <Field htmlFor="name" label="Name">
              <Input
                id="name"
                name="name"
                value={editedCommand.name}
                onChange={handleInputChange}
                className={FIELD_INPUT}
                required
              />
            </Field>

            <Field
              htmlFor="keyword"
              label="Keyword"
              error={
                showKeywordError
                  ? 'A command with this keyword already exists. Choose a different keyword.'
                  : null
              }
            >
              <Input
                id="keyword"
                name="keyword"
                value={editedCommand.keyword}
                onChange={handleInputChange}
                className={`${FIELD_INPUT_MONO} text-mono-keyword ${
                  showKeywordError ? FIELD_ERROR_BORDER : ''
                }`}
                aria-invalid={showKeywordError}
                aria-describedby={showKeywordError ? 'keyword-error' : undefined}
                required
              />
            </Field>

            <Field label="Type">
              <div className="flex gap-1.5 rounded-[10px] border border-hairline bg-surface-chrome p-1">
                {TYPES.map(({ value, label }) => {
                  const active = editedCommand.type === value
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      title={`Send as ${label.toLowerCase()}`}
                      onClick={() => setCommandType(value)}
                      className={`flex h-[34px] flex-1 items-center justify-center gap-[7px] rounded-[7px] text-[13px] transition-colors ${
                        active
                          ? 'bg-nav-active font-medium text-foreground'
                          : 'text-text-dim hover:text-foreground'
                      }`}
                    >
                      <span
                        className={`h-[7px] w-[7px] rounded-[2px] ${
                          active
                            ? value === 'speech'
                              ? 'bg-type-speech'
                              : 'bg-type-barcode'
                            : 'bg-glyph-dimmer'
                        }`}
                        aria-hidden
                      />
                      {label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field htmlFor="value" label="Value">
              <Input
                id="value"
                name="value"
                value={editedCommand.value}
                onChange={handleInputChange}
                className={FIELD_INPUT_MONO}
                required
              />
            </Field>

            <Field htmlFor="description" label="Description" optional>
              <Textarea
                id="description"
                name="description"
                value={editedCommand.description}
                onChange={handleInputChange}
                className={`${FIELD_TEXTAREA} h-[62px] min-h-[62px]`}
              />
            </Field>
          </ModalBody>

          <ModalFooter onCancel={onClose} submitLabel={isEditing ? 'Save changes' : 'Create'} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

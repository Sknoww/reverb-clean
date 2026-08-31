import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ArrowUpDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Field,
  FIELD_ERROR_BORDER,
  FIELD_INPUT,
  MODAL_CONTENT,
  MODAL_FORM,
  ModalBody,
  ModalFooter,
  ModalHeader
} from './modalShell'

const MARKER = <ArrowUpDown className="h-3.5 w-3.5 text-accent-indigo" aria-hidden />

interface ProfileFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string) => void

  zones?: string[]
  initialName?: string
  title: string
  submitLabel: string

  takenNames: string[]
}

export function SyncProfileFormModal({
  isOpen,
  onClose,
  onSubmit,
  zones,
  initialName = '',
  title,
  submitLabel,
  takenNames
}: ProfileFormModalProps) {
  const [name, setName] = useState(initialName)
  const [duplicate, setDuplicate] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(initialName)
      setDuplicate(false)
    }
  }, [isOpen, initialName])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    if (takenNames.some((taken) => taken.toLowerCase() === trimmed.toLowerCase())) {
      setDuplicate(true)
      return
    }
    onSubmit(trimmed)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={MODAL_CONTENT} showCloseButton={false}>
        <form onSubmit={handleSubmit} className={MODAL_FORM}>
          <ModalHeader marker={MARKER} title={title} onClose={onClose} />
          <DialogDescription className="sr-only">
            Name this profile. A profile stores the selected zones only.
          </DialogDescription>

          <ModalBody>
            <Field
              htmlFor="profile-name"
              label="Name"
              error={duplicate ? 'A profile with that name already exists.' : null}
            >
              <Input
                id="profile-name"
                name="profile-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setDuplicate(false)
                }}
                className={`${FIELD_INPUT} ${duplicate ? FIELD_ERROR_BORDER : ''}`}
                aria-invalid={duplicate}
                aria-describedby={duplicate ? 'profile-name-error' : undefined}
                autoFocus
                required
              />
            </Field>

            {zones && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-normal text-muted-foreground">
                  Zones <span className="ml-1 text-glyph-dim">{zones.length} selected</span>
                </span>
                <div className="flex max-h-[168px] flex-wrap gap-1.5 overflow-y-auto rounded-[9px] border border-border-control bg-surface-control p-2.5">
                  {zones.length > 0 ? (
                    zones.map((zone) => (
                      <span
                        key={zone}
                        className="rounded-md border border-primary bg-nav-active px-2 py-0.5 text-xs text-accent-indigo-bright"
                      >
                        {zone}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-glyph-dim">
                      Nothing selected — this profile would deploy no workflows.
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-glyph-dim">
                  A profile stores zones only — versions always come from the latest scan.
                </span>
              </div>
            )}
          </ModalBody>

          <ModalFooter onCancel={onClose} submitLabel={submitLabel} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ProfileDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  profileName: string
  zoneCount: number
}

export function SyncProfileDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  profileName,
  zoneCount
}: ProfileDeleteModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={MODAL_CONTENT}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          // Focus Cancel so Enter cannot confirm deletion accidentally.
          cancelRef.current?.focus()
        }}
      >
        <ModalHeader marker={MARKER} title="Delete profile" onClose={onClose} />
        <DialogDescription className="sr-only">
          Confirm deleting this profile. Your current selection is not affected.
        </DialogDescription>

        <ModalBody>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">{profileName}</span> and its {zoneCount} zone
            {zoneCount === 1 ? '' : 's'} will be removed from your profiles. Your current selection
            and your local YAML are left alone.
          </p>
        </ModalBody>

        <DialogFooter className="flex-row items-center justify-end gap-2.5 space-x-0 border-t border-hairline px-5 pb-[18px] pt-3.5 sm:space-x-0">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-[38px] rounded-[9px] border-border-control bg-transparent px-4 text-[13px] text-zinc-300 shadow-none hover:bg-row-hover hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="h-[38px] rounded-[9px] px-[18px] text-[13px] font-medium shadow-none"
          >
            Delete profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

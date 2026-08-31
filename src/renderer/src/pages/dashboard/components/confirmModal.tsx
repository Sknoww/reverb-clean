import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ReactNode, useRef } from 'react'
import { MODAL_CONTENT, ModalBody, ModalHeader } from './modalShell'

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  marker,
  title,
  confirmLabel,
  description,
  children
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  marker: ReactNode
  title: string
  confirmLabel: string

  description: string
  children: ReactNode
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={MODAL_CONTENT}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <ModalHeader marker={marker} title={title} onClose={onClose} />
        <DialogDescription className="sr-only">{description}</DialogDescription>

        <ModalBody>{children}</ModalBody>

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
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

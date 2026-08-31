import { LuTrash2 } from 'react-icons/lu'
import { ConfirmModal } from './confirmModal'

export function DeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete',
  message = 'Are you sure?'
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message?: string
}) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      marker={<LuTrash2 className="h-3.5 w-3.5 text-red-400" aria-hidden />}
      title={title}
      confirmLabel="Delete"
      description={message}
    >
      <p className="text-[13px] leading-relaxed text-muted-foreground">{message}</p>
    </ConfirmModal>
  )
}

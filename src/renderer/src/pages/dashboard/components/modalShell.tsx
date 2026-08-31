import { Button } from '@/components/ui/button'
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ReactNode } from 'react'
import { LuX } from 'react-icons/lu'

export const MODAL_CONTENT =
  'flex w-[468px] max-w-[468px] flex-col gap-0 overflow-hidden border-border-control bg-surface-editor p-0 shadow-[0_30px_70px_rgba(0,0,0,0.6)] sm:rounded-[14px]'

export const MODAL_FORM = 'flex min-h-0 flex-col'

export const FIELD_INPUT =
  'h-10 rounded-[9px] border-border-control bg-surface-control px-3 text-sm text-foreground shadow-none placeholder:text-text-dim'

export const FIELD_INPUT_MONO = `${FIELD_INPUT} font-mono text-[13px] md:text-[13px]`

export const FIELD_TEXTAREA =
  'resize-none rounded-[9px] border-border-control bg-surface-control px-3 py-2.5 text-[13px] text-foreground shadow-none placeholder:text-text-dim md:text-[13px]'

export const FIELD_ERROR_BORDER = 'border-red-400/50'

interface ModalHeaderProps {
  marker: ReactNode
  title: string
  onClose: () => void
}

export function ModalHeader({ marker, title, onClose }: ModalHeaderProps) {
  return (
    <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-hairline px-5 pb-3.5 pt-[18px]">
      <div className="flex min-w-0 items-center gap-2.5">
        {marker}
        <DialogTitle className="truncate text-base font-semibold text-foreground">
          {title}
        </DialogTitle>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="-mr-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
      >
        <LuX size={16} />
      </button>
    </DialogHeader>
  )
}

export function ModalBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-[18px]">{children}</div>
  )
}

interface ModalFooterProps {
  onCancel: () => void
  submitLabel: string
}

export function ModalFooter({ onCancel, submitLabel }: ModalFooterProps) {
  return (
    <DialogFooter className="flex-row items-center justify-end gap-2.5 space-x-0 border-t border-hairline px-5 pb-[18px] pt-3.5 sm:space-x-0">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        className="h-[38px] rounded-[9px] border-border-control bg-transparent px-4 text-[13px] text-zinc-300 shadow-none hover:bg-row-hover hover:text-foreground"
      >
        Cancel
      </Button>
      <Button
        type="submit"
        className="h-[38px] rounded-[9px] px-[18px] text-[13px] font-medium shadow-none"
      >
        {submitLabel}
      </Button>
    </DialogFooter>
  )
}

interface FieldProps {
  htmlFor?: string
  label: string
  optional?: boolean

  hint?: string

  error?: string | null
  children: ReactNode
}

const FIELD_LABEL = 'text-xs font-normal text-muted-foreground'

export function Field({ htmlFor, label, optional, hint, error, children }: FieldProps) {
  const caption = (
    <>
      {label}
      {optional && <span className="ml-1.5 text-glyph-dim">optional</span>}
    </>
  )

  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className={FIELD_LABEL}>
          {caption}
        </Label>
      ) : (
        <span className={FIELD_LABEL}>{caption}</span>
      )}
      {children}
      {hint && <p className="text-xs leading-snug text-glyph-dim">{hint}</p>}
      {error && (
        <p
          id={`${htmlFor ?? label}-error`}
          role="alert"
          className="text-xs leading-snug text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  )
}

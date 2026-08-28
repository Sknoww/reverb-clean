import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AdbCommand } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { LuCrosshair, LuLoaderCircle, LuScanLine } from 'react-icons/lu'
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
  const [scanStage, setScanStage] = useState<'idle' | 'capturing' | 'selecting' | 'decoding'>(
    'idle'
  )
  const [scanResult, setScanResult] = useState<Awaited<
    ReturnType<Window['barcodeAPI']['scanScreens']>
  > | null>(null)
  const scanToken = useRef(0)
  const valueInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      scanToken.current += 1
      setEditedCommand(command || { ...defaultCommand, id: uuid() })
      setKeywordEdited(false)
      setScanStage('idle')
      setScanResult(null)
    } else {
      scanToken.current += 1
    }
  }, [command, isOpen])

  useEffect(() => {
    if (error) setKeywordEdited(false)
  }, [error])

  const showKeywordError = Boolean(error) && !keywordEdited

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'keyword') setKeywordEdited(true)
    if (name === 'value') setScanResult(null)
    setEditedCommand((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    scanToken.current += 1
    setKeywordEdited(false)
    onSave(editedCommand, isEditing ? command : null)
  }

  const setCommandType = (type: string) => {
    if (type !== 'barcode') {
      scanToken.current += 1
      setScanStage('idle')
      setScanResult(null)
    }
    setEditedCommand((prev) => ({ ...prev, type }))
  }

  const handleClose = () => {
    scanToken.current += 1
    onClose()
  }

  const reviewValue = () => {
    requestAnimationFrame(() => {
      valueInput.current?.focus()
      valueInput.current?.select()
    })
  }

  const chooseBarcode = (value: string) => {
    setEditedCommand((prev) => ({ ...prev, value }))
    setScanResult(null)
    reviewValue()
  }

  const handleScan = async () => {
    if (scanStage !== 'idle') return
    const token = ++scanToken.current
    setScanResult(null)
    setScanStage('capturing')

    try {
      const result = await window.barcodeAPI.scanScreens((progress) => {
        if (scanToken.current === token) setScanStage(progress)
      })
      if (scanToken.current !== token) return

      setScanStage('idle')
      if (result.status === 'found') {
        setEditedCommand((prev) => ({ ...prev, value: result.barcode.text }))
        reviewValue()
        return
      }
      if (result.status !== 'cancelled') setScanResult(result)
    } catch {
      if (scanToken.current !== token) return
      setScanStage('idle')
      setScanResult({ status: 'capture-failed' })
    }
  }

  const handleRegionSelect = async () => {
    if (scanStage !== 'idle') return
    const token = ++scanToken.current
    setScanResult(null)
    setScanStage('capturing')

    try {
      const result = await window.barcodeAPI.selectRegion((progress) => {
        if (scanToken.current === token) setScanStage(progress)
      })
      if (scanToken.current !== token) return

      setScanStage('idle')
      if (result.status === 'found') {
        setEditedCommand((prev) => ({ ...prev, value: result.barcode.text }))
        reviewValue()
        return
      }
      if (result.status !== 'cancelled') setScanResult(result)
    } catch {
      if (scanToken.current !== token) return
      setScanStage('idle')
      setScanResult({ status: 'capture-failed' })
    }
  }

  const typeDot = editedCommand.type === 'speech' ? 'bg-type-speech' : 'bg-type-barcode'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className={MODAL_CONTENT} showCloseButton={false}>
        <form onSubmit={handleSubmit} className={MODAL_FORM}>
          <ModalHeader
            marker={<span className={`h-2 w-2 rounded-[2px] ${typeDot}`} aria-hidden />}
            title={`${isEditing ? 'Edit' : 'New'} ${title}`}
            onClose={handleClose}
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
              <div className="flex gap-2">
                <Input
                  ref={valueInput}
                  id="value"
                  name="value"
                  value={editedCommand.value}
                  onChange={handleInputChange}
                  className={`${FIELD_INPUT_MONO} min-w-0 flex-1`}
                  required
                />
                {editedCommand.type === 'barcode' && (
                  <div className="flex flex-shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={handleScan}
                      disabled={scanStage !== 'idle'}
                      className="flex h-10 items-center gap-2 rounded-[9px] border border-border-control bg-surface-control px-3 text-xs text-zinc-300 transition-colors hover:bg-row-hover hover:text-foreground disabled:cursor-wait disabled:opacity-60"
                      title="Scan all visible screens for Data Matrix and QR codes"
                    >
                      {scanStage !== 'idle' ? (
                        <LuLoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <LuScanLine className="h-4 w-4" aria-hidden />
                      )}
                      {scanStage === 'capturing'
                        ? 'Capturing…'
                        : scanStage === 'selecting'
                          ? 'Selecting…'
                          : scanStage === 'decoding'
                            ? 'Decoding…'
                            : 'Scan screens'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegionSelect}
                      disabled={scanStage !== 'idle'}
                      className="flex h-10 items-center gap-2 rounded-[9px] border border-border-control bg-surface-control px-3 text-xs text-zinc-300 transition-colors hover:bg-row-hover hover:text-foreground disabled:cursor-wait disabled:opacity-60"
                      title="Select part of a screen to scan"
                    >
                      <LuCrosshair className="h-4 w-4" aria-hidden />
                      Select region
                    </button>
                  </div>
                )}
              </div>

              {editedCommand.type === 'barcode' && scanResult?.status === 'not-found' && (
                <p role="status" className="text-xs leading-snug text-amber-200">
                  No Data Matrix or QR code found
                </p>
              )}

              {editedCommand.type === 'barcode' && scanResult?.status === 'multiple' && (
                <div className="flex flex-col gap-1.5 rounded-[9px] border border-border-control bg-surface-chrome p-2">
                  <p className="px-1 text-xs text-muted-foreground">
                    Choose one of {scanResult.barcodes.length} codes
                  </p>
                  {scanResult.barcodes.map((barcode, index) => {
                    const preview =
                      barcode.text.length > 52
                        ? `${barcode.text.slice(0, 49)}…`
                        : barcode.text || 'Empty payload'
                    return (
                      <button
                        key={`${barcode.displayId}-${index}`}
                        type="button"
                        onClick={() => chooseBarcode(barcode.text)}
                        className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-row-hover"
                      >
                        <span className="flex-shrink-0 rounded bg-nav-active px-1.5 py-0.5 text-[10px] font-medium text-type-barcode">
                          {barcode.symbology === 'QRCode' ? 'QR' : 'Data Matrix'}
                        </span>
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                          Display {barcode.displayNumber}
                        </span>
                        <span className="truncate font-mono text-xs text-zinc-300">{preview}</span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={handleRegionSelect}
                    className="self-start px-2 py-1 text-xs font-medium text-zinc-300 hover:text-foreground"
                  >
                    Select a smaller region…
                  </button>
                </div>
              )}

              {editedCommand.type === 'barcode' && scanResult?.status === 'permission-denied' && (
                <div className="flex items-start justify-between gap-3 rounded-[9px] border border-amber-300/20 bg-amber-300/5 p-2.5">
                  <p role="alert" className="text-xs leading-snug text-amber-100">
                    Screen Recording permission is required. Grant Reverb access, then relaunch the
                    app.
                  </p>
                  <button
                    type="button"
                    onClick={() => void window.barcodeAPI.openScreenRecordingSettings()}
                    className="flex-shrink-0 text-xs font-medium text-amber-200 hover:text-amber-100"
                  >
                    Open Settings
                  </button>
                </div>
              )}

              {editedCommand.type === 'barcode' &&
                scanResult &&
                ['capture-failed', 'decoder-failed', 'busy'].includes(scanResult.status) && (
                  <p role="alert" className="text-xs leading-snug text-red-300">
                    {scanResult.status === 'busy'
                      ? 'A screen scan is already running.'
                      : scanResult.status === 'decoder-failed'
                        ? 'The captured screens could not be decoded. Try the scan again.'
                        : 'The screens could not be captured. Try again and check screen permissions.'}
                  </p>
                )}
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

          <ModalFooter onCancel={handleClose} submitLabel={isEditing ? 'Save changes' : 'Create'} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

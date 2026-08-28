import { COMMAND_BAR_KEY } from '@/constants/shortcuts'
import { AdbCommand } from '@/types'
import { forwardRef, useState } from 'react'
import { LuPlus } from 'react-icons/lu'
import { v4 as uuid } from 'uuid'

export type CommandBarType = 'barcode' | 'speech'

interface CommandBarProps {
  commands?: AdbCommand[]
  barType: CommandBarType
  onBarTypeChange: (type: CommandBarType) => void
  handleSendCommand: (command: AdbCommand) => void
  handleAddCommand: (isCommon: boolean, inputValue?: string, type?: string) => void
  hasProject?: boolean
  /** A target is configured (area 19). */
  canSend?: boolean
}

// Command bar (redesign C4) — replaces the old `InputCard` row of buttons.
export const CommandBar = forwardRef<HTMLInputElement, CommandBarProps>(function CommandBar(
  {
    commands,
    barType,
    onBarTypeChange,
    handleSendCommand,
    handleAddCommand,
    hasProject = true,
    canSend = true
  },
  ref
) {
  const [inputValue, setInputValue] = useState('')

  const run = () => {
    const value = inputValue.trim()
    if (!value || !canSend) return
    const match = commands?.find((c) => c.keyword === value)
    if (match) {
      handleSendCommand(match)
    } else {
      handleSendCommand({
        id: uuid(),
        name: '',
        type: barType,
        keyword: '',
        value,
        description: ''
      })
    }
    setInputValue('')
  }

  // Chips always carry a border so they read as buttons against the dark bar; the active type additionally fills with its own accent...
  const barcodeChip =
    barType === 'barcode'
      ? 'border-type-barcode/50 bg-type-barcode/10 text-type-barcode'
      : 'border-border-control text-muted-foreground hover:border-border-bar hover:text-foreground'
  const speechChip =
    barType === 'speech'
      ? 'border-type-speech/50 bg-type-speech/10 text-type-speech'
      : 'border-border-control text-muted-foreground hover:border-border-bar hover:text-foreground'
  const chipBase =
    'flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors'

  return (
    <div
      className="flex h-[46px] items-center gap-2 rounded-xl border border-border-bar bg-surface-control px-4 focus-within:border-accent-indigo/40"
      style={{ boxShadow: '0 0 0 4px rgba(124, 127, 166, 0.06)' }}
    >
      <span className="select-none font-mono text-accent-indigo" aria-hidden>
        ›
      </span>
      <input
        ref={ref}
        id="command-bar"
        name="command-bar"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') run()
        }}
        placeholder={
          canSend
            ? `Run a value or keyword…  ${COMMAND_BAR_KEY} to focus`
            : 'Type to save a command — running needs a target'
        }
        className="bare-input mr-1 h-full flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-text-dim"
        autoFocus
      />

      <button
        type="button"
        onClick={() => onBarTypeChange('barcode')}
        className={`${chipBase} ${barcodeChip}`}
        aria-pressed={barType === 'barcode'}
        title="Run as barcode"
      >
        <span className="h-2 w-2 flex-shrink-0 rounded-[2px] bg-type-barcode" aria-hidden />
        Barcode
      </button>
      <button
        type="button"
        onClick={() => onBarTypeChange('speech')}
        className={`${chipBase} ${speechChip}`}
        aria-pressed={barType === 'speech'}
        title="Run as speech"
      >
        <span className="h-2 w-2 flex-shrink-0 rounded-[2px] bg-type-speech" aria-hidden />
        Speech
      </button>

      <span className="h-5 w-px flex-shrink-0 bg-hairline" aria-hidden />

      <button
        type="button"
        onClick={() => {
          handleAddCommand(false, inputValue, barType)
          setInputValue('')
        }}
        disabled={!hasProject}
        title={hasProject ? 'Save to project' : 'Select or create a project first'}
        className="flex h-7 items-center gap-1 rounded-md border border-border-control px-2.5 text-xs text-muted-foreground transition-colors hover:border-border-bar hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LuPlus size={13} />
        Save
      </button>
    </div>
  )
})

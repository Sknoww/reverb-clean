import { useScrollMemory } from '@/lib/hooks/use-scroll-memory'
import { useSessionState } from '@/lib/hooks/use-session-state'
import { AdbCommand, Project } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { CommandBar, CommandBarType } from '../components/commandBar'
import { CommandTable, CommandTypeFilter } from '../components/commandTable'
import { TARGET_MESSAGES, TargetNotice } from '../components/targetNotice'

interface CommandTabProps {
  project: Project | null
  handleAddCommand: (isCommon: boolean, inputValue?: string, type?: string) => void
  handleEditCommand: (command: AdbCommand | null, isCommon: boolean) => void
  handleShowDeleteModal: (command: AdbCommand) => void
  handleSendCommand: (command: AdbCommand) => void
  handleRescanCommand: (command: AdbCommand) => void
  handleReorderCommands: (commands: AdbCommand[]) => void

  canSend: boolean
}

export function CommandTab({
  project,
  handleAddCommand,
  handleEditCommand,
  handleShowDeleteModal,
  handleSendCommand,
  handleRescanCommand,
  handleReorderCommands,
  canSend
}: CommandTabProps) {
  const [barType, setBarType] = useState<CommandBarType>('barcode')
  const [activeTypeFilter, setActiveTypeFilter] = useSessionState<CommandTypeFilter>(
    'commands.typeFilter',
    'all'
  )
  const inputRef = useRef<HTMLInputElement>(null)

  const listRef = useScrollMemory('commands')

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-1">
        <div className="max-w-sm space-y-3 text-center">
          <h3 className="text-lg font-medium">No Project Selected</h3>
          <p className="text-sm text-muted-foreground">
            Select an existing project or create a new one to start adding commands.
          </p>
          <p className="text-xs text-muted-foreground">
            Use the project dropdown in the top-left corner to get started.
          </p>
        </div>
      </div>
    )
  }

  const commands = project.commands ?? []
  const counts = {
    all: commands.length,
    barcode: commands.filter((c) => c.type === 'barcode').length,
    speech: commands.filter((c) => c.type === 'speech').length
  }

  const filterChip = (value: CommandTypeFilter) =>
    activeTypeFilter === value
      ? 'bg-nav-active border-border-bar text-foreground'
      : 'border-hairline text-muted-foreground hover:text-foreground'

  return (
    <div className="flex h-full flex-col">
      {!canSend && (
        <div className="flex-shrink-0 pb-3 pt-1">
          <TargetNotice message={TARGET_MESSAGES.commands} />
        </div>
      )}

      <div className="flex-shrink-0 pb-3 pt-1">
        <CommandBar
          ref={inputRef}
          commands={commands}
          barType={barType}
          onBarTypeChange={setBarType}
          handleSendCommand={handleSendCommand}
          handleAddCommand={handleAddCommand}
          hasProject={!!project}
          canSend={canSend}
        />
      </div>
      <div className="flex flex-shrink-0 items-center gap-2 pb-3">
        <button
          type="button"
          onClick={() => setActiveTypeFilter('all')}
          className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${filterChip('all')}`}
        >
          All <span className="font-mono text-glyph-dim">{counts.all}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTypeFilter('barcode')}
          className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${filterChip('barcode')}`}
        >
          <span className="h-2 w-2 rounded-[2px] bg-type-barcode" aria-hidden />
          Barcode <span className="font-mono text-glyph-dim">{counts.barcode}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTypeFilter('speech')}
          className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${filterChip('speech')}`}
        >
          <span className="h-2 w-2 rounded-[2px] bg-type-speech" aria-hidden />
          Speech <span className="font-mono text-glyph-dim">{counts.speech}</span>
        </button>

        <span className="ml-auto select-none text-xs text-glyph-dim">Sort: manual</span>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto pb-4 pr-1"
        style={{ scrollbarGutter: 'stable' }}
      >
        <CommandTable
          commands={commands}
          activeTypeFilter={activeTypeFilter}
          handleEditCommand={handleEditCommand}
          handleShowDeleteModal={handleShowDeleteModal}
          handleSendCommand={handleSendCommand}
          handleRescanCommand={handleRescanCommand}
          handleReorderCommands={handleReorderCommands}
          canSend={canSend}
        />
      </div>
    </div>
  )
}

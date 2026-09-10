import { AdbCommand } from '@/types'
import { arrayMove } from '@dnd-kit/sortable'

export const isPinned = (command: AdbCommand): boolean => command.pinned === true

// The flat array stays the single source of order; the two blocks are a view of it.
export function splitPinned(commands: AdbCommand[]): {
  pinned: AdbCommand[]
  rest: AdbCommand[]
} {
  return {
    pinned: commands.filter(isPinned),
    rest: commands.filter((command) => !isPinned(command))
  }
}

// Unpinning drops the key rather than storing false, matching what the validator writes.
export function togglePinned(commands: AdbCommand[], keyword: string): AdbCommand[] {
  return commands.map((command) => {
    if (command.keyword !== keyword) return command
    if (isPinned(command)) {
      const unpinned = { ...command }
      delete unpinned.pinned
      return unpinned
    }
    return { ...command, pinned: true }
  })
}

// A block reorders within the slots it already occupies, so the other block cannot shift.
export function reorderWithinBlock(
  commands: AdbCommand[],
  activeKeyword: string,
  overKeyword: string
): AdbCommand[] | null {
  const active = commands.find((command) => command.keyword === activeKeyword)
  const over = commands.find((command) => command.keyword === overKeyword)
  // Pinning is the star's job, so a drag across the boundary is not a reorder.
  if (!active || !over || isPinned(active) !== isPinned(over)) return null

  const slots: number[] = []
  const block: AdbCommand[] = []
  commands.forEach((command, index) => {
    if (isPinned(command) === isPinned(active)) {
      slots.push(index)
      block.push(command)
    }
  })

  const from = block.findIndex((command) => command.keyword === activeKeyword)
  const to = block.findIndex((command) => command.keyword === overKeyword)
  if (from === to) return null

  const moved = arrayMove(block, from, to)
  const next = [...commands]
  slots.forEach((slot, index) => {
    next[slot] = moved[index]
  })
  return next
}

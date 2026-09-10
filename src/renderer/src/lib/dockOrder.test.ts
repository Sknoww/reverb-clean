import { describe, expect, it } from 'vitest'
import { AdbCommand } from '@/types'
import { isPinned, reorderWithinBlock, splitPinned, togglePinned } from './dockOrder'

const cmd = (keyword: string, pinned?: boolean): AdbCommand => ({
  id: keyword,
  name: keyword,
  keyword,
  type: 'speech',
  value: keyword,
  ...(pinned ? { pinned: true } : {})
})

const interleavedLibrary = [
  cmd('MHE', true),
  cmd('Preview'),
  cmd('NoEquip', true),
  cmd('Cancel'),
  cmd('Process', true),
  cmd('Induct', true),
  cmd('Exit')
]

const keywords = (commands: AdbCommand[]) => commands.map((command) => command.keyword)

describe('splitPinned', () => {
  it('keeps each block in the flat array order', () => {
    const { pinned, rest } = splitPinned(interleavedLibrary)
    expect(keywords(pinned)).toEqual(['MHE', 'NoEquip', 'Process', 'Induct'])
    expect(keywords(rest)).toEqual(['Preview', 'Cancel', 'Exit'])
  })

  it('puts everything in the rest block for a library that has never pinned', () => {
    const { pinned, rest } = splitPinned([cmd('a'), cmd('b')])
    expect(pinned).toEqual([])
    expect(keywords(rest)).toEqual(['a', 'b'])
  })
})

describe('togglePinned', () => {
  it('pins an unpinned command and leaves its neighbours alone', () => {
    const next = togglePinned(interleavedLibrary, 'Cancel')
    expect(isPinned(next[3])).toBe(true)
    expect(keywords(next)).toEqual(keywords(interleavedLibrary))
  })

  it('unpins a pinned command without moving it in the flat array', () => {
    const next = togglePinned(interleavedLibrary, 'MHE')
    expect(isPinned(next[0])).toBe(false)
    expect(next[0].keyword).toBe('MHE')
  })

  it('round-trips, so pinning and unpinning restores the original ordering', () => {
    expect(togglePinned(togglePinned(interleavedLibrary, 'Exit'), 'Exit')).toEqual(
      interleavedLibrary
    )
  })
})

describe('reorderWithinBlock', () => {
  it('reorders the pinned sequence and leaves the unpinned rows in their slots', () => {
    const next = reorderWithinBlock(interleavedLibrary, 'Induct', 'NoEquip')
    expect(next).not.toBeNull()
    expect(keywords(splitPinned(next!).pinned)).toEqual(['MHE', 'Induct', 'NoEquip', 'Process'])
    expect(keywords(splitPinned(next!).rest)).toEqual(['Preview', 'Cancel', 'Exit'])
  })

  it('reorders the unpinned block without disturbing the pinned sequence', () => {
    const next = reorderWithinBlock(interleavedLibrary, 'Exit', 'Preview')
    expect(keywords(splitPinned(next!).rest)).toEqual(['Exit', 'Preview', 'Cancel'])
    expect(keywords(splitPinned(next!).pinned)).toEqual(['MHE', 'NoEquip', 'Process', 'Induct'])
  })

  it('refuses a drag across the boundary, because the row menu is what pins', () => {
    expect(reorderWithinBlock(interleavedLibrary, 'MHE', 'Cancel')).toBeNull()
    expect(reorderWithinBlock(interleavedLibrary, 'Exit', 'Process')).toBeNull()
  })

  it('refuses a drop onto the row being dragged', () => {
    expect(reorderWithinBlock(interleavedLibrary, 'MHE', 'MHE')).toBeNull()
  })

  it('refuses a keyword that is not in the library', () => {
    expect(reorderWithinBlock(interleavedLibrary, 'MHE', 'Missing')).toBeNull()
  })

  it('never changes the library length or its membership', () => {
    const next = reorderWithinBlock(interleavedLibrary, 'Induct', 'MHE')!
    expect(next).toHaveLength(interleavedLibrary.length)
    expect([...keywords(next)].sort()).toEqual([...keywords(interleavedLibrary)].sort())
  })
})

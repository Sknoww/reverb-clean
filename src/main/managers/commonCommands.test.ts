import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/reverb-test' } }))
vi.mock('../logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  applyLoggingConfig: vi.fn()
}))
vi.mock('./projectManager', () => ({ setProjectsDirectory: vi.fn() }))

import { validateCommonCommands } from './configManager'

const command = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'Select MHE',
  keyword: 'MHE',
  type: 'speech',
  value: 'select mhe',
  ...over
})

describe('validateCommonCommands', () => {
  it('keeps a pinned command pinned', () => {
    expect(validateCommonCommands([command({ pinned: true })])[0].pinned).toBe(true)
  })

  it('leaves an unpinned command without the key rather than with a false one', () => {
    expect(validateCommonCommands([command()])[0]).not.toHaveProperty('pinned')
  })

  it('drops a stored false rather than carrying it, so the two shapes cannot diverge', () => {
    expect(validateCommonCommands([command({ pinned: false })])[0]).not.toHaveProperty('pinned')
  })

  it('ignores a non-boolean pinned', () => {
    expect(validateCommonCommands([command({ pinned: 'yes' })])[0]).not.toHaveProperty('pinned')
  })

  it('is idempotent, so a read cannot change what the previous read wrote', () => {
    const once = validateCommonCommands([command({ pinned: true }), command({ keyword: 'Exit' })])
    expect(validateCommonCommands(once)).toEqual(once)
  })

  it('preserves the stored order, since the pinned block is a view of it', () => {
    const result = validateCommonCommands([
      command({ keyword: 'MHE', pinned: true }),
      command({ keyword: 'Preview' }),
      command({ keyword: 'Induct', pinned: true })
    ])
    expect(result.map((c) => c.keyword)).toEqual(['MHE', 'Preview', 'Induct'])
  })

  it('still drops a command missing its required fields', () => {
    expect(validateCommonCommands([command(), { name: 'No keyword' }])).toHaveLength(1)
  })

  it('keeps the six existing fields untouched', () => {
    expect(validateCommonCommands([command({ description: 'ok' })])[0]).toEqual({
      id: 'c1',
      name: 'Select MHE',
      keyword: 'MHE',
      type: 'speech',
      value: 'select mhe',
      description: 'ok'
    })
  })

  it('returns an empty library for a config that has none', () => {
    expect(validateCommonCommands(undefined)).toEqual([])
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/reverb-test' } }))
vi.mock('../logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  applyLoggingConfig: vi.fn()
}))
vi.mock('./projectManager', () => ({ setProjectsDirectory: vi.fn() }))

import { dedupeRecentProjectIds, nextRecentProjectIds } from './configManager'

const a = 'alpha.project.json'
const b = 'beta.project.json'
const g = 'gamma.project.json'

describe('dedupeRecentProjectIds', () => {
  it('keeps the latest position of a repeated id', () => {
    expect(dedupeRecentProjectIds([a, b, a])).toEqual([b, a])
  })

  it('drops empty entries', () => {
    expect(dedupeRecentProjectIds(['', a, ''])).toEqual([a])
  })

  it('leaves a healthy list untouched', () => {
    expect(dedupeRecentProjectIds([g, b, a])).toEqual([g, b, a])
  })
})

describe('nextRecentProjectIds', () => {
  it('appends the project being left and removes the one being opened', () => {
    expect(nextRecentProjectIds([g, b], a, b)).toEqual([g, a])
  })

  it('does not repeat a project that is already in the list', () => {
    expect(nextRecentProjectIds([g, a, b], a, b)).toEqual([g, a])
  })

  it('ignores an empty previous project', () => {
    expect(nextRecentProjectIds([g, b], '', b)).toEqual([g])
  })

  it('reopening the current project leaves the list alone', () => {
    expect(nextRecentProjectIds([g, b], a, a)).toEqual([g, b])
  })

  it('caps the list at five, dropping the oldest', () => {
    const ids = ['1', '2', '3', '4', '5']
    expect(nextRecentProjectIds(ids, '6', '7')).toEqual(['2', '3', '4', '5', '6'])
  })
})

import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ pids: [] as string[], children: [] as any[] }))

vi.mock('child_process', () => ({
  execFile: (_a: string, _args: string[], _o: unknown, cb: (e: null, out: string) => void) =>
    cb(null, mocks.pids.length > 1 ? (mocks.pids.shift() as string) : (mocks.pids[0] ?? '')),
  spawn: () => {
    const child: any = new EventEmitter()
    child.stdout = new EventEmitter()
    child.kill = vi.fn()
    mocks.children.push(child)
    return child
  }
}))
vi.mock('../utils/adbUtils', () => ({ getAdbPath: () => 'adb' }))

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../logger', () => ({ default: { warn: vi.fn() } }))
vi.mock('./configManager', () => ({ loadConfig: () => ({ adbPath: '' }) }))

import {
  disposeWorkflowTracker,
  parseWorkflowLine,
  setWorkflowListener,
  watchWorkflow
} from './workflowTracker'

describe('parseWorkflowLine', () => {
  it('keeps whitespace in the workflow name', () => {
    expect(parseWorkflowLine('D/Tag( 42): setup() - parent: 1. Step One  ')).toEqual({
      workflow: '1. Step One'
    })
  })

  it('reads the step after the transition arrow', () => {
    expect(parseWorkflowLine('I/Tag( 42): Transitioning: Idle -> Scanning')).toEqual({
      step: 'Scanning'
    })
  })

  it('ignores unrelated lines', () => {
    expect(parseWorkflowLine('I/Tag( 42): hello')).toEqual({})
  })
})

describe('tracker lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.children.length = 0
    mocks.pids = ['100']
  })
  afterEach(() => {
    disposeWorkflowTracker()
    vi.useRealTimers()
  })

  it('reattaches when the app pid changes while logcat stays open', async () => {
    watchWorkflow('d', 'pkg')
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.children).toHaveLength(1)
    mocks.pids = ['200']
    await vi.advanceTimersByTimeAsync(3000)
    expect(mocks.children[0].kill).toHaveBeenCalled()
    expect(mocks.children).toHaveLength(2)
  })

  it('replays cached state to a replacement listener for the same target', async () => {
    watchWorkflow('d', 'pkg')
    await vi.advanceTimersByTimeAsync(0)
    const listener = vi.fn()
    setWorkflowListener(listener)
    watchWorkflow('d', 'pkg')
    expect(listener).toHaveBeenCalledWith({})
  })

  it('dispose kills the child and prevents further attachments', async () => {
    watchWorkflow('d', 'pkg')
    await vi.advanceTimersByTimeAsync(0)
    disposeWorkflowTracker()
    mocks.children[0].emit('close')
    await vi.advanceTimersByTimeAsync(10000)
    expect(mocks.children[0].kill).toHaveBeenCalled()
    expect(mocks.children).toHaveLength(1)
  })
})

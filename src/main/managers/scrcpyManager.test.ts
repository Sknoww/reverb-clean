import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdb: vi.fn(),
  discoveries: 0,
  release: undefined as undefined | ((devices: unknown[]) => void)
}))

vi.mock('child_process', () => ({
  execFile: (_c: string, _a: string[], _o: unknown, cb: (e: null) => void) => cb(null)
}))
vi.mock('fs/promises', () => ({ readFile: async () => new Uint8Array() }))
vi.mock('../logger', () => ({ default: { info: vi.fn(), error: vi.fn() } }))
vi.mock('../utils/adbUtils', () => ({
  getAdbPath: () => 'adb',
  getBundledScrcpyServerPath: () => 'jar'
}))
vi.mock('./configManager', () => ({ loadConfig: () => ({ adbPath: '' }) }))
vi.mock('@yume-chan/adb', () => ({
  AdbServerClient: class {
    getDevices = () => {
      mocks.discoveries++
      return new Promise((resolve) => (mocks.release = resolve))
    }
    createAdb = mocks.createAdb
  }
}))
vi.mock('@yume-chan/adb-scrcpy', () => ({ AdbScrcpyClient: {}, AdbScrcpyOptions3_3_3: class {} }))
vi.mock('@yume-chan/adb-server-node-tcp', () => ({ AdbServerNodeTcpConnector: class {} }))
vi.mock('@yume-chan/scrcpy', () => ({
  AndroidKeyCode: {},
  AndroidKeyEventAction: {},
  AndroidKeyEventMeta: {},
  AndroidMotionEventAction: {},
  AndroidMotionEventButton: {},
  ScrcpyCodecOptions: class {},
  ScrcpyControlMessageWriter: class {}
}))
vi.mock('@yume-chan/stream-extra', () => ({ Consumable: class {}, ReadableStream: class {} }))

import { startScrcpy } from './scrcpyManager'

describe('startScrcpy', () => {
  it('shares one startup between starts overlapping during device discovery', async () => {
    const first = startScrcpy('dev')
    const second = startScrcpy('dev')
    await vi.waitFor(() => expect(mocks.release).toBeDefined())
    mocks.release?.([])
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(a.running).toBe(false)
    expect(mocks.discoveries).toBe(1)
  })
})

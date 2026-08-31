import { beforeAll, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  exposed: new Map<string, Record<string, (...args: unknown[]) => unknown>>(),
  invoke: vi.fn(async () => undefined),
  on: vi.fn(),
  send: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: Record<string, (...args: unknown[]) => unknown>) =>
      electron.exposed.set(name, api)
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    send: electron.send,
    removeListener: electron.removeListener
  }
}))

beforeAll(async () => {
  await import('./index')
})

describe('screen permission preload boundary', () => {
  it('exposes only fixed status, repair, settings and relaunch operations', async () => {
    const api = electron.exposed.get('screenPermissionAPI')!
    expect(Object.keys(api)).toEqual(['getStatus', 'repair', 'openSettings', 'relaunch'])

    await api.getStatus()
    await api.repair()
    await api.openSettings()
    await api.relaunch()

    expect(electron.invoke.mock.calls.slice(-4)).toEqual([
      ['screenPermission:status'],
      ['screenPermission:repair'],
      ['screenPermission:openSettings'],
      ['screenPermission:relaunch']
    ])
  })
})

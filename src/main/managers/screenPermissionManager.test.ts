import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const log = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock('../logger', () => ({ default: log }))
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: vi.fn(() => '1.4.0'),
    getPath: vi.fn(() => '/unused'),
    relaunch: vi.fn(),
    quit: vi.fn()
  },
  systemPreferences: { getMediaAccessStatus: vi.fn(() => 'not-determined') }
}))

import {
  createScreenPermissionManager,
  type ScreenPermissionDependencies
} from './screenPermissionManager'

const statePath = join('/user-data', 'screen-permission.json')
const fingerprintHash = (fingerprint: string) =>
  createHash('sha256').update(`# designated => cdhash H"${fingerprint}"`).digest('hex')

const missing = (): NodeJS.ErrnoException => Object.assign(new Error('missing'), { code: 'ENOENT' })

const state = (
  fingerprint: string,
  permission: 'granted' | 'denied' | 'restricted' | 'not-determined',
  recoveryStage: 'awaiting-registration' | 'awaiting-approval' | null = null
) =>
  JSON.stringify({
    version: 1,
    fingerprint,
    appVersion: '1.4.0',
    lastObservedPermission: permission,
    repairAttemptedFingerprint: null,
    recoveryStage
  })

const seam = (
  overrides: Partial<ScreenPermissionDependencies> & {
    files?: Map<string, string>
    fingerprint?: string
  } = {}
) => {
  const files = overrides.files ?? new Map<string, string>()
  const fingerprint = overrides.fingerprint ?? 'build-a'
  const run = vi.fn(async (executable: string) => {
    if (executable === '/usr/bin/codesign') {
      return { stdout: '', stderr: `# designated => cdhash H"${fingerprint}"\n` }
    }
    return { stdout: '', stderr: '' }
  })
  const dependencies: ScreenPermissionDependencies = {
    platform: 'darwin',
    packaged: true,
    version: () => '1.4.0',
    executablePath: () => '/Applications/Reverb.app/Contents/MacOS/Reverb',
    userDataPath: () => '/user-data',
    permission: () => 'not-determined',
    run,
    read: vi.fn(async (path) => {
      const contents = files.get(path)
      if (contents === undefined) throw missing()
      return contents
    }),
    makeDirectory: vi.fn(async () => undefined),
    write: vi.fn(async (path, contents) => {
      files.set(path, contents)
    }),
    move: vi.fn(async (source, destination) => {
      const contents = files.get(source)
      if (contents === undefined) throw missing()
      files.delete(source)
      files.set(destination, contents)
    }),
    relaunch: vi.fn(),
    quit: vi.fn(),
    ...overrides
  }
  return { manager: createScreenPermissionManager(dependencies), dependencies, files, run }
}

beforeEach(() => vi.clearAllMocks())

describe('screenPermissionManager', () => {
  it('records a fresh packaged build atomically and keeps not-requested distinct', async () => {
    const { manager, dependencies, files } = seam()

    await expect(manager.getStatus()).resolves.toMatchObject({
      platform: 'darwin',
      status: 'not-requested',
      recovery: 'none'
    })
    expect(dependencies.write).toHaveBeenCalledWith(
      expect.stringMatching(/screen-permission\.json\..+\.tmp$/),
      expect.any(String)
    )
    expect(dependencies.move).toHaveBeenCalledWith(expect.stringContaining('.tmp'), statePath)
    expect(dependencies.run).toHaveBeenCalledWith('/usr/bin/codesign', [
      '-d',
      '-r-',
      '/Applications/Reverb.app/Contents/MacOS/Reverb'
    ])
    expect(files.get(statePath)).toContain('"lastObservedPermission": "not-determined"')
  })

  it('recognizes the same identity and observes a grant', async () => {
    const files = new Map([[statePath, state(fingerprintHash('build-a'), 'not-determined')]])
    const first = seam({ files, fingerprint: 'build-a' })
    await first.manager.getStatus()
    const persisted = JSON.parse(files.get(statePath)!)
    const second = seam({ files, fingerprint: 'build-a', permission: () => 'granted' })

    await expect(second.manager.getStatus()).resolves.toMatchObject({ status: 'allowed' })
    expect(persisted.fingerprint).toBe(fingerprintHash('build-a'))
  })

  it('detects a changed ad-hoc identity after a grant even at the same app version', async () => {
    const first = seam({ permission: () => 'granted', fingerprint: 'build-a' })
    await first.manager.getStatus()
    const second = seam({ files: first.files, permission: () => 'denied', fingerprint: 'build-b' })

    await expect(second.manager.getStatus()).resolves.toMatchObject({
      status: 'needs-repair',
      recovery: 'none'
    })
    expect(JSON.parse(first.files.get(statePath)!).lastObservedPermission).toBe('granted')
  })

  it('preserves the stale-build signal when the denied scan happens before a status read', async () => {
    const previous = seam({ permission: () => 'granted', fingerprint: 'build-a' })
    await previous.manager.getStatus()
    const next = seam({ files: previous.files, permission: () => 'denied', fingerprint: 'build-b' })

    await next.manager.observeUserScan()
    await expect(next.manager.getStatus()).resolves.toMatchObject({ status: 'needs-repair' })
  })

  it('keeps intentional denial and restriction distinct from a stale grant', async () => {
    const denied = seam({ permission: () => 'denied', fingerprint: 'build-a' })
    await denied.manager.getStatus()
    const nextDenied = seam({
      files: denied.files,
      permission: () => 'denied',
      fingerprint: 'build-b'
    })
    const restricted = seam({
      files: new Map([[statePath, state('old', 'granted')]]),
      permission: () => 'restricted',
      fingerprint: 'build-b'
    })

    await expect(nextDenied.manager.getStatus()).resolves.toMatchObject({ status: 'denied' })
    await expect(restricted.manager.getStatus()).resolves.toMatchObject({ status: 'restricted' })
  })

  it('runs only the scoped tccutil reset and records registration before the command', async () => {
    const previous = seam({ permission: () => 'granted', fingerprint: 'build-a' })
    await previous.manager.getStatus()
    const next = seam({ files: previous.files, permission: () => 'denied', fingerprint: 'build-b' })
    await next.manager.getStatus()

    await expect(next.manager.repair()).resolves.toEqual({ success: true })
    const resetCall = next.dependencies.run as ReturnType<typeof vi.fn>
    expect(resetCall).toHaveBeenCalledWith('/usr/bin/tccutil', [
      'reset',
      'ScreenCapture',
      'com.sknow.reverb'
    ])
    expect(resetCall).not.toHaveBeenCalledWith('/usr/bin/tccutil', ['reset', 'ScreenCapture'])
    expect(JSON.parse(next.files.get(statePath)!).recoveryStage).toBe('awaiting-registration')
  })

  it('leaves the stale signal retryable when the scoped reset fails', async () => {
    const previous = seam({ permission: () => 'granted', fingerprint: 'build-a' })
    await previous.manager.getStatus()
    const next = seam({
      files: previous.files,
      permission: () => 'denied',
      fingerprint: 'build-b',
      run: vi.fn(async (executable) => {
        if (executable === '/usr/bin/tccutil') throw new Error('not permitted')
        return { stdout: '', stderr: '# designated => cdhash H"build-b"\n' }
      })
    })

    await expect(next.manager.repair()).resolves.toMatchObject({ success: false })
    await expect(next.manager.getStatus()).resolves.toMatchObject({ status: 'needs-repair' })
    const persisted = JSON.parse(next.files.get(statePath)!)
    expect(persisted.lastObservedPermission).toBe('granted')
    expect(persisted.recoveryStage).toBeNull()
  })

  it('moves a repaired build from registration to approval after the first denied scan', async () => {
    const files = new Map([
      [statePath, state(fingerprintHash('build-a'), 'not-determined', 'awaiting-registration')]
    ])
    const current = seam({ files, fingerprint: 'build-a', permission: () => 'denied' })

    await expect(current.manager.getStatus()).resolves.toMatchObject({
      status: 'not-requested',
      recovery: 'awaiting-registration'
    })
    await current.manager.observeUserScan()
    expect(JSON.parse(files.get(statePath)!).recoveryStage).toBe('awaiting-approval')
  })

  it('recommends the final relaunch after approval, then clears recovery on that launch', async () => {
    let permission = 'denied'
    const files = new Map([
      [statePath, state(fingerprintHash('build-a'), 'not-determined', 'awaiting-registration')]
    ])
    const current = seam({ files, fingerprint: 'build-a', permission: () => permission })
    await current.manager.observeUserScan()
    permission = 'granted'

    await expect(current.manager.getStatus()).resolves.toMatchObject({
      status: 'allowed',
      recovery: 'awaiting-approval',
      relaunchRecommended: true
    })

    const relaunched = seam({ files, fingerprint: 'build-a', permission: () => permission })
    await expect(relaunched.manager.getStatus()).resolves.toMatchObject({
      status: 'allowed',
      recovery: 'none',
      relaunchRecommended: false
    })
  })

  it('recovers from corrupt state and does nothing on non-darwin', async () => {
    const corrupt = seam({ files: new Map([[statePath, '{bad json']]) })
    await expect(corrupt.manager.getStatus()).resolves.toMatchObject({ status: 'not-requested' })
    expect(log.warn).toHaveBeenCalled()

    const other = seam({ platform: 'win32' })
    await expect(other.manager.getStatus()).resolves.toEqual({
      platform: 'unsupported',
      status: 'unavailable',
      recovery: 'none',
      relaunchRecommended: false
    })
    expect(other.dependencies.run).not.toHaveBeenCalled()
  })

  it('schedules a relaunch before quitting', () => {
    const current = seam()
    current.manager.relaunch()
    expect(current.dependencies.relaunch).toHaveBeenCalledBefore(
      current.dependencies.quit as ReturnType<typeof vi.fn>
    )
  })
})

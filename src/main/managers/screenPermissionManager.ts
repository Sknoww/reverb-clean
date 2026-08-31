import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, systemPreferences } from 'electron'
import logger from '../logger'
import type { ScreenPermissionStatus } from '../types'

const CODESIGN_EXECUTABLE = '/usr/bin/codesign'
const TCCUTIL_EXECUTABLE = '/usr/bin/tccutil'
const TCCUTIL_ARGUMENTS = ['reset', 'ScreenCapture', 'com.sknow.reverb'] as const
const STATE_FILE = 'screen-permission.json'

type Permission = 'granted' | 'denied' | 'restricted' | 'not-determined'
type RecoveryStage = 'awaiting-registration' | 'awaiting-approval' | null

interface PermissionState {
  version: 1
  fingerprint: string
  appVersion: string
  lastObservedPermission: Permission
  repairAttemptedFingerprint: string | null
  recoveryStage: RecoveryStage
}

interface CommandResult {
  stdout: string
  stderr: string
}

export interface ScreenPermissionDependencies {
  platform: NodeJS.Platform
  packaged: boolean
  version: () => string
  executablePath: () => string
  userDataPath: () => string
  permission: () => string
  run: (executable: string, args: readonly string[]) => Promise<CommandResult>
  read: (path: string) => Promise<string>
  makeDirectory: (path: string) => Promise<void>
  write: (path: string, contents: string) => Promise<void>
  move: (source: string, destination: string) => Promise<void>
  relaunch: () => void
  quit: () => void
}

const run = (executable: string, args: readonly string[]): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    execFile(executable, [...args], (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve({ stdout, stderr })
    })
  })

const defaultDependencies: ScreenPermissionDependencies = {
  platform: process.platform,
  packaged: app.isPackaged,
  version: () => app.getVersion(),
  executablePath: () => app.getPath('exe'),
  userDataPath: () => app.getPath('userData'),
  permission: () => systemPreferences.getMediaAccessStatus('screen'),
  run,
  read: (path) => readFile(path, 'utf8'),
  makeDirectory: async (path) => {
    await mkdir(path, { recursive: true, mode: 0o700 })
  },
  write: (path, contents) => writeFile(path, contents, { encoding: 'utf8', mode: 0o600 }),
  move: rename,
  relaunch: () => app.relaunch(),
  quit: () => app.quit()
}

const normalizePermission = (permission: string): Permission => {
  if (permission === 'granted' || permission === 'denied' || permission === 'restricted') {
    return permission
  }
  return 'not-determined'
}

const isPermissionState = (value: unknown): value is PermissionState => {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<PermissionState>
  return (
    state.version === 1 &&
    typeof state.fingerprint === 'string' &&
    typeof state.appVersion === 'string' &&
    ['granted', 'denied', 'restricted', 'not-determined'].includes(
      state.lastObservedPermission ?? ''
    ) &&
    (state.repairAttemptedFingerprint === null ||
      typeof state.repairAttemptedFingerprint === 'string') &&
    (state.recoveryStage === null ||
      state.recoveryStage === 'awaiting-registration' ||
      state.recoveryStage === 'awaiting-approval')
  )
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const createScreenPermissionManager = (
  overrides: Partial<ScreenPermissionDependencies> = {}
) => {
  const dependencies = { ...defaultDependencies, ...overrides }
  const statePath = join(dependencies.userDataPath(), STATE_FILE)
  let launchRecoveryStage: RecoveryStage | undefined
  let operation = Promise.resolve()

  const serialize = <T>(action: () => Promise<T>): Promise<T> => {
    const result = operation.then(action, action)
    operation = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  const readState = async (): Promise<PermissionState | null> => {
    try {
      const parsed: unknown = JSON.parse(await dependencies.read(statePath))
      if (isPermissionState(parsed)) return parsed
      logger.warn('Ignoring invalid screen permission state')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Ignoring unreadable screen permission state', { error: errorMessage(error) })
      }
    }
    return null
  }

  const writeState = async (state: PermissionState): Promise<void> => {
    await dependencies.makeDirectory(dirname(statePath))
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`
    await dependencies.write(temporaryPath, `${JSON.stringify(state, null, 2)}\n`)
    await dependencies.move(temporaryPath, statePath)
  }

  const getFingerprint = async (): Promise<string | null> => {
    if (!dependencies.packaged) return null
    try {
      const result = await dependencies.run(CODESIGN_EXECUTABLE, [
        '-d',
        '-r-',
        dependencies.executablePath()
      ])
      const requirement = `${result.stdout}\n${result.stderr}`
        .split('\n')
        .find((line) => line.startsWith('# designated =>'))
      if (!requirement) throw new Error('codesign returned no designated requirement')
      return createHash('sha256').update(requirement).digest('hex')
    } catch (error) {
      logger.warn('Could not read packaged screen permission fingerprint', {
        error: errorMessage(error)
      })
      return null
    }
  }

  const publicStatus = (
    permission: Permission,
    recoveryStage: RecoveryStage,
    needsRepair: boolean,
    relaunchRecommended = false
  ): ScreenPermissionStatus => ({
    platform: 'darwin',
    status: needsRepair
      ? 'needs-repair'
      : recoveryStage === 'awaiting-registration'
        ? 'not-requested'
        : permission === 'granted'
          ? 'allowed'
          : permission === 'restricted'
            ? 'restricted'
            : permission === 'denied'
              ? 'denied'
              : 'not-requested',
    recovery:
      recoveryStage === 'awaiting-registration'
        ? 'awaiting-registration'
        : recoveryStage === 'awaiting-approval'
          ? 'awaiting-approval'
          : 'none',
    relaunchRecommended
  })

  const getStatus = async (): Promise<ScreenPermissionStatus> => {
    if (dependencies.platform !== 'darwin') {
      return {
        platform: 'unsupported',
        status: 'unavailable',
        recovery: 'none',
        relaunchRecommended: false
      }
    }

    const permission = normalizePermission(dependencies.permission())
    const fingerprint = await getFingerprint()
    if (!fingerprint) return publicStatus(permission, null, false)

    const state = await readState()
    if (launchRecoveryStage === undefined) launchRecoveryStage = state?.recoveryStage ?? null

    if (!state) {
      await writeState({
        version: 1,
        fingerprint,
        appVersion: dependencies.version(),
        lastObservedPermission: permission,
        repairAttemptedFingerprint: null,
        recoveryStage: null
      })
      return publicStatus(permission, null, false)
    }

    const fingerprintChanged = state.fingerprint !== fingerprint
    const needsRepair =
      fingerprintChanged && state.lastObservedPermission === 'granted' && permission === 'denied'
    if (needsRepair) return publicStatus(permission, null, true)

    if (state.recoveryStage === 'awaiting-approval' && permission === 'granted') {
      if (launchRecoveryStage === 'awaiting-approval') {
        await writeState({
          ...state,
          fingerprint,
          appVersion: dependencies.version(),
          lastObservedPermission: permission,
          recoveryStage: null
        })
        return publicStatus(permission, null, false)
      }
      return publicStatus(permission, state.recoveryStage, false, true)
    }

    if (fingerprintChanged || state.lastObservedPermission !== permission) {
      await writeState({
        ...state,
        fingerprint,
        appVersion: dependencies.version(),
        lastObservedPermission: permission
      })
    }
    return publicStatus(permission, state.recoveryStage, false)
  }

  const repair = async (): Promise<{ success: boolean; error?: string }> => {
    if (dependencies.platform !== 'darwin') {
      return { success: false, error: 'Screen Recording repair is available only on macOS.' }
    }

    const fingerprint = await getFingerprint()
    const state = await readState()
    const permission = normalizePermission(dependencies.permission())
    if (
      !fingerprint ||
      !state ||
      state.fingerprint === fingerprint ||
      state.lastObservedPermission !== 'granted' ||
      permission !== 'denied'
    ) {
      return { success: false, error: 'This build does not need Screen Recording repair.' }
    }

    try {
      await writeState({
        version: 1,
        fingerprint,
        appVersion: dependencies.version(),
        lastObservedPermission: 'not-determined',
        repairAttemptedFingerprint: fingerprint,
        recoveryStage: 'awaiting-registration'
      })
      await dependencies.run(TCCUTIL_EXECUTABLE, TCCUTIL_ARGUMENTS)
      return { success: true }
    } catch (error) {
      await writeState({ ...state, repairAttemptedFingerprint: fingerprint })
      return {
        success: false,
        error: `Reverb could not reset its Screen Recording permission: ${errorMessage(error)}`
      }
    }
  }

  const observeUserScan = async (): Promise<void> => {
    if (dependencies.platform !== 'darwin') return
    const fingerprint = await getFingerprint()
    if (!fingerprint) return
    const state = await readState()
    if (!state) return
    if (launchRecoveryStage === undefined) launchRecoveryStage = state.recoveryStage

    const permission = normalizePermission(dependencies.permission())
    if (
      state.fingerprint !== fingerprint &&
      state.lastObservedPermission === 'granted' &&
      permission === 'denied'
    ) {
      return
    }
    let recoveryStage = state.recoveryStage
    if (recoveryStage === 'awaiting-registration' && permission === 'denied') {
      recoveryStage = 'awaiting-approval'
    } else if (permission === 'granted') {
      recoveryStage = null
    }

    await writeState({
      ...state,
      fingerprint,
      appVersion: dependencies.version(),
      lastObservedPermission: permission,
      recoveryStage
    })
  }

  const relaunch = (): void => {
    dependencies.relaunch()
    dependencies.quit()
  }

  return {
    getStatus: () => serialize(getStatus),
    repair: () => serialize(repair),
    observeUserScan: () => serialize(observeUserScan),
    relaunch
  }
}

let sharedManager: ReturnType<typeof createScreenPermissionManager> | null = null
const getSharedManager = () => (sharedManager ??= createScreenPermissionManager())

export const getScreenPermissionStatus = () => getSharedManager().getStatus()
export const repairScreenPermission = () => getSharedManager().repair()
export const observeScreenPermissionScan = () => getSharedManager().observeUserScan()
export const relaunchForScreenPermission = () => getSharedManager().relaunch()

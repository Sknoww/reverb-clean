import { exec as execCallback } from 'child_process'
import { promisify } from 'util'
import logger from '../logger'
import { getAdbPath } from '../utils/adbUtils'
import { loadConfig } from './configManager'
import { runProvision } from './provisionManager'
import { runAdbBroadcast } from './adbBroadcast'
import { ProvisionProgress, ProvisionResult } from '../types'

export interface AdbCommandResult {
  success: boolean
  output?: string
  error?: string
}

export interface ClearStorageResult extends AdbCommandResult {
  provision?: ProvisionResult
}

export interface AdbDevice {
  id: string
  model?: string
  status: string
}

const exec = promisify(execCallback)

const describeExecError = (error: any): string =>
  error?.killed
    ? 'adb did not respond in time — check the device connection, or raise the ADB timeout in Settings.'
    : error?.message || 'Unknown error executing ADB command'

const NO_TARGET = (what: string): AdbCommandResult => ({
  success: false,
  error: `No ${what} configured — set one in Settings → Target.`
})

export const getAdbVersion = async (): Promise<string | null> => {
  try {
    const config = loadConfig()
    const adb = getAdbPath(config.adbPath)
    const { stdout } = await exec(`"${adb}" version`, { timeout: config.behavior.adbTimeoutMs })

    const match = stdout.match(/^Version\s+(\S+)/m)
    if (!match) {
      logger.error('Could not parse adb version from output:', stdout)
      return null
    }

    const version = match[1].split('-')[0]
    logger.info('ADB version:', version)
    return version
  } catch (error: any) {
    logger.error('Failed to get adb version:', error)
    return null
  }
}

export const getConnectedDevices = async (): Promise<AdbDevice[]> => {
  try {
    const config = loadConfig()

    const adb = `"${getAdbPath(config.adbPath)}"`
    const command = `${adb} devices -l`
    logger.info('Getting connected devices:', command)

    const { stdout, stderr } = await exec(command, { timeout: config.behavior.adbTimeoutMs })

    if (stderr && stderr.toLowerCase().includes('error')) {
      logger.error('Error getting devices:', stderr)
      return []
    }

    const lines = stdout.split('\n').slice(1)
    const devices: AdbDevice[] = []

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      const parts = trimmedLine.split(/\s+/)
      if (parts.length < 2) continue

      const id = parts[0]
      const status = parts[1]

      const modelMatch = trimmedLine.match(/model:(\S+)/)
      const model = modelMatch ? modelMatch[1] : undefined

      devices.push({ id, status, model })
    }

    logger.info('Connected devices:', devices)
    return devices
  } catch (error: any) {
    logger.error('Failed to get connected devices:', error)
    return []
  }
}

export const executeAdbCommand = async (type: string, value: string): Promise<AdbCommandResult> => {
  const config = loadConfig()
  const commandType = type === 'speech' ? 'speech' : 'barcode'
  const intent = commandType === 'speech' ? config.target.speechIntent : config.target.barcodeIntent
  if (!intent) return NO_TARGET(`${commandType} intent action`)

  return runAdbBroadcast({
    adbPath: getAdbPath(config.adbPath),
    deviceId: config.currentDeviceId,
    intent,
    type: commandType,
    value,
    timeoutMs: config.behavior.adbTimeoutMs
  })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface TargetRun {
  adb: string
  deviceFlag: string
  execOptions: { timeout: number }
  packageId: string
  launcherActivity: string
}

const resolveTargetRun = (): { run: TargetRun } | { refusal: AdbCommandResult } => {
  const config = loadConfig()
  const { packageId, launcherActivity } = config.target
  if (!packageId) return { refusal: NO_TARGET('target package') }
  if (!launcherActivity) return { refusal: NO_TARGET('launcher activity') }

  const deviceId = config.currentDeviceId
  return {
    run: {
      adb: getAdbPath(config.adbPath),
      deviceFlag: deviceId ? `-s ${deviceId} ` : '',
      execOptions: { timeout: config.behavior.adbTimeoutMs },
      packageId,
      launcherActivity
    }
  }
}

const launchTarget = async (run: TargetRun): Promise<AdbCommandResult> => {
  const { adb, deviceFlag, packageId, launcherActivity } = run
  const startCommand = `"${adb}" ${deviceFlag}shell am start -n ${packageId}/${launcherActivity}`
  logger.info(`Starting application with ADB command: ${startCommand}`)

  try {
    const { stdout } = await exec(startCommand, run.execOptions)
    logger.info('Start command completed successfully')
    return { success: true, output: stdout }
  } catch (error) {
    logger.error('Error executing start command:', error)
    return { success: false, error: describeExecError(error) }
  }
}

export const executeAdbApplicationReset = async (): Promise<AdbCommandResult> => {
  const resolved = resolveTargetRun()
  if ('refusal' in resolved) return resolved.refusal
  const { run } = resolved

  try {
    const forceStopCommand = `"${run.adb}" ${run.deviceFlag}shell am force-stop ${run.packageId}`
    logger.info(`Force stopping application with ADB command: ${forceStopCommand}`)

    try {
      await exec(forceStopCommand, run.execOptions)
      logger.info('Force stop command completed successfully')
    } catch (error: any) {
      logger.error('Error executing force stop command:', error.message)
      return {
        success: false,
        error: describeExecError(error)
      }
    }

    logger.info('Waiting for application to fully stop...')
    await sleep(2000)

    return await launchTarget(run)
  } catch (error: any) {
    logger.error('Application reset failed:', error)
    return {
      success: false,
      error: describeExecError(error)
    }
  }
}

export const executeAdbClearStorage = async (
  onProvisionProgress?: (progress: ProvisionProgress) => void
): Promise<ClearStorageResult> => {
  const resolved = resolveTargetRun()
  if ('refusal' in resolved) return resolved.refusal
  const { run } = resolved

  try {
    const clearCommand = `"${run.adb}" ${run.deviceFlag}shell pm clear ${run.packageId}`
    logger.info(`Clearing application storage with ADB command: ${clearCommand}`)

    let output: string
    try {
      const { stdout } = await exec(clearCommand, run.execOptions)
      output = stdout.trim()
    } catch (error) {
      logger.error('Error executing clear storage command:', error)
      return { success: false, error: describeExecError(error) }
    }

    // pm clear can print Failed while still exiting successfully.
    if (!/^Success/m.test(output)) {
      logger.error('Clear storage did not report success:', output)
      return {
        success: false,
        error: `Could not clear storage for ${run.packageId} — adb said: ${output || 'nothing'}. Check the package id in Settings → Target.`
      }
    }

    logger.info('Clear storage command completed successfully')

    await sleep(2000)

    const provision = await runProvision({ onProgress: onProvisionProgress })
    if (!provision.success) {
      return {
        success: false,
        error: `Storage was cleared, but provisioning failed — the client was left stopped. ${provision.error}`,
        provision
      }
    }

    const launched = await launchTarget(run)
    return provision.steps.length > 0 ? { ...launched, provision } : launched
  } catch (error) {
    logger.error('Clear storage failed:', error)
    return {
      success: false,
      error: describeExecError(error)
    }
  }
}

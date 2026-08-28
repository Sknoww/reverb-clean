import { exec as execCallback } from 'child_process'
import { promisify } from 'util'
import logger from '../logger'
import { getAdbPath } from '../utils/adbUtils'
import { loadConfig } from './configManager'
import { runProvision } from './provisionManager'
import { ProvisionProgress, ProvisionResult } from '../types'

export interface AdbCommandResult {
  success: boolean
  output?: string
  error?: string
}

/** A clear carries its provisioning routine's outcome (area 28) so the caller can report *which step* stopped it rather than a single line. */
export interface ClearStorageResult extends AdbCommandResult {
  provision?: ProvisionResult
}

export interface AdbDevice {
  id: string
  model?: string
  status: string
}

const exec = promisify(execCallback)

/** Every adb invocation runs under the configured ceiling (18b). */

/** Timed-out rejections carry a signal, not a message worth showing. */
const describeExecError = (error: any): string =>
  error?.killed
    ? 'adb did not respond in time — check the device connection, or raise the ADB timeout in Settings.'
    : error?.message || 'Unknown error executing ADB command'

/** The client every command targets is `config.target` now (area 19) — it used to be a hard-coded package constant here plus a hand-synced... */
const NO_TARGET = (what: string): AdbCommandResult => ({
  success: false,
  error: `No ${what} configured — set one in Settings → Target.`
})

// The running adb's release, for the status bar — the bundled binary unless `config.adbPath` overrides it (18b).
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

// Get list of connected devices
export const getConnectedDevices = async (): Promise<AdbDevice[]> => {
  try {
    const config = loadConfig()
    // Quoted: an overridden adb path (18b) is arbitrary user input and routinely contains spaces — `C:\Program Files\platform-tools\adb.exe`.
    const adb = `"${getAdbPath(config.adbPath)}"`
    const command = `${adb} devices -l`
    logger.info('Getting connected devices:', command)

    const { stdout, stderr } = await exec(command, { timeout: config.behavior.adbTimeoutMs })

    if (stderr && stderr.toLowerCase().includes('error')) {
      logger.error('Error getting devices:', stderr)
      return []
    }

    const lines = stdout.split('\n').slice(1) // Skip "List of devices attached"
    const devices: AdbDevice[] = []

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      const parts = trimmedLine.split(/\s+/)
      if (parts.length < 2) continue

      const id = parts[0]
      const status = parts[1]

      // Extract model if available
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

/** Send a command as a broadcast. */
export const executeAdbCommand = async (type: string, value: string): Promise<AdbCommandResult> => {
  try {
    const config = loadConfig()
    const intent = type === 'speech' ? config.target.speechIntent : config.target.barcodeIntent
    if (!intent) return NO_TARGET(`${type === 'speech' ? 'speech' : 'barcode'} intent action`)

    const adb = getAdbPath(config.adbPath)
    const deviceId = config.currentDeviceId
    logger.info('Device ID:', deviceId)
    const deviceFlag = deviceId ? `-s ${deviceId} ` : ''
    const command = `"${adb}" ${deviceFlag}shell "am broadcast -a ${intent} --es data \\"${value}\\""`

    logger.info(`Executing ADB command: ${command}`)

    const { stdout, stderr } = await exec(command, { timeout: config.behavior.adbTimeoutMs })

    if (stderr && stderr.toLowerCase().includes('error')) {
      logger.error('Error executing ADB command:', stderr)
      return {
        success: false,
        error: stderr
      }
    }

    logger.info('ADB command result:', stdout)
    return {
      success: true,
      output: stdout
    }
  } catch (error: any) {
    logger.error('ADB command failed:', error)
    return {
      success: false,
      error: describeExecError(error)
    }
  }
}

// Sleep helper function
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The two device actions — Reset client and Clear storage (area 25) — are both "stop the client, then bring it back", against the same... */
interface TargetRun {
  adb: string
  deviceFlag: string
  execOptions: { timeout: number }
  packageId: string
  launcherActivity: string
}

/** Both halves of the target are required before *either* action runs — stopping a client we then can't relaunch leaves the device worse... */
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

/** The launch half both actions end on. */
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

// Application reset with device selection
export const executeAdbApplicationReset = async (): Promise<AdbCommandResult> => {
  const resolved = resolveTargetRun()
  if ('refusal' in resolved) return resolved.refusal
  const { run } = resolved

  try {
    // First command: Force stop
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

    // Sleep for a specified time (e.g., 2000ms = 2 seconds)
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

/** Clear the target's storage, run the provisioning routine, then relaunch (areas 25 and 28). */
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

    // `pm clear` prints `Success` or `Failed` and exits 0 either way, so the exec resolving proves nothing.
    if (!/^Success/m.test(output)) {
      logger.error('Clear storage did not report success:', output)
      return {
        success: false,
        error: `Could not clear storage for ${run.packageId} — adb said: ${output || 'nothing'}. Check the package id in Settings → Target.`
      }
    }

    logger.info('Clear storage command completed successfully')
    // Same settle as a reset before the relaunch.
    await sleep(2000)

    // With no steps configured this returns immediately and the path below is
    // byte-for-byte what area 25 shipped.
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

import { spawn } from 'child_process'
import path from 'path'
import logger from '../logger'
import { getAdbPath } from '../utils/adbUtils'
import { loadConfig } from './configManager'
import {
  ProvisionPermissionResult,
  ProvisionProgress,
  ProvisionResult,
  ProvisionStep,
  ProvisionStepResult
} from '../types'

/** The routine that runs between `pm clear` and the relaunch (area 28), and the same steps on their own from the top bar's split control. */

interface AdbRun {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  spawnError?: string
}

/** adb narrates its own daemon lifecycle, and it does so on stderr — a cold `adb` writes `* daemon not running; starting now at tcp:5037`... */
const stripAdbChatter = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\* daemon/.test(line) && !/^adb server/.test(line))
    .join('\n')
    .trim()

/** Area 25's finding generalised: `pm clear` prints `Failed` and exits 0, and the `pm`/`am` family is not alone in it. */
const FAILURE_LINE =
  /^\s*(?:adb: (?:error|failed)|Failure|Failed|Error|Exception|java\.lang\.\w+(?:Exception|Error))\b/im

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const runAdb = (adbPath: string, args: string[], timeoutMs: number): Promise<AdbRun> =>
  new Promise((resolve) => {
    let settled = false
    const finish = (run: AdbRun): void => {
      if (settled) return
      settled = true
      resolve(run)
    }

    const child = spawn(adbPath, args)

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      // Same kill as `jsManager`: a bare `child.kill()` on Windows leaves adb's
      // own children behind.
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'])
      } else {
        child.kill()
      }
    }, timeoutMs)

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      finish({ code, stdout, stderr, timedOut })
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      finish({ code: null, stdout, stderr, timedOut, spawnError: error.message })
    })
  })

interface StepOutcome {
  success: boolean
  output?: string
  error?: string
  permissions?: ProvisionPermissionResult[]
}

const classify = (run: AdbRun, timeoutMs: number): StepOutcome => {
  const output = [stripAdbChatter(run.stdout), stripAdbChatter(run.stderr)]
    .filter(Boolean)
    .join('\n')

  if (run.spawnError)
    return { success: false, output, error: `Could not run adb: ${run.spawnError}` }

  if (run.timedOut) {
    return {
      success: false,
      output,
      error: `Step did not finish within ${Math.round(timeoutMs / 1000)}s — raise the provisioning timeout in Settings → Behavior.`
    }
  }

  if (run.code !== 0) {
    return { success: false, output, error: output || `adb exited with code ${run.code}` }
  }

  // Exit 0 with a failure line: the `pm clear` shape.
  if (FAILURE_LINE.test(output)) {
    return { success: false, output, error: output }
  }

  return { success: true, output }
}

/** What progress and the failure report call a step. */
export const describeStep = (step: ProvisionStep): string => {
  if (step.label) return step.label

  switch (step.type) {
    case 'shell':
      return step.command
    case 'push':
      return `push ${step.source} → ${step.destination}`
    case 'grant':
      return `grant ${step.permissions.length} permission${step.permissions.length === 1 ? '' : 's'}`
    case 'wait':
      return `wait ${step.durationMs}ms`
  }
}

interface RunContext {
  adbPath: string
  /** `['-s', id]`, or empty when no device is selected — `adbManager`'s posture. */
  deviceArgs: string[]
  packageId: string
  sourceRoot: string
  timeoutMs: number
}

const runStep = async (step: ProvisionStep, context: RunContext): Promise<StepOutcome> => {
  const { adbPath, deviceArgs, packageId, sourceRoot, timeoutMs } = context

  switch (step.type) {
    case 'wait':
      await sleep(step.durationMs)
      return { success: true }

    case 'shell':
      // The whole command line is one argv element: adb passes it to the device shell verbatim, so nothing here needs host-side quoting.
      return classify(
        await runAdb(adbPath, [...deviceArgs, 'shell', step.command], timeoutMs),
        timeoutMs
      )

    case 'push': {
      const source = path.isAbsolute(step.source)
        ? step.source
        : path.resolve(sourceRoot, step.source)

      const args = [
        ...deviceArgs,
        'push',
        ...(step.sync ? ['--sync'] : []),
        source,
        step.destination
      ]
      return classify(await runAdb(adbPath, args, timeoutMs), timeoutMs)
    }

    case 'grant': {
      // Every permission is attempted even after one fails, then the step fails as a whole: a step that reports "3 of 4 granted" is worth more...
      const permissions: ProvisionPermissionResult[] = []

      for (const permission of step.permissions) {
        const outcome = classify(
          await runAdb(
            adbPath,
            [...deviceArgs, 'shell', 'pm', 'grant', packageId, permission],
            timeoutMs
          ),
          timeoutMs
        )
        permissions.push({
          permission,
          success: outcome.success,
          ...(outcome.success ? {} : { error: outcome.error })
        })
      }

      const failed = permissions.filter((entry) => !entry.success)
      return {
        success: failed.length === 0,
        permissions,
        output: permissions
          .map((entry) => `${entry.success ? '✓' : '✕'} ${entry.permission}`)
          .join('\n'),
        ...(failed.length === 0
          ? {}
          : {
              error: `${failed.length} of ${permissions.length} permission${
                permissions.length === 1 ? '' : 's'
              } could not be granted: ${failed.map((entry) => entry.permission).join(', ')}`
            })
      }
    }
  }
}

const refusal = (error: string): ProvisionResult => {
  logger.error('Provisioning refused:', error)
  return { success: false, steps: [], error }
}

/** Run the configured routine. */
export const runProvision = async (
  options: { onProgress?: (progress: ProvisionProgress) => void } = {}
): Promise<ProvisionResult> => {
  const config = loadConfig()
  const { steps, sourceRoot } = config.provision

  if (steps.length === 0) return { success: true, steps: [] }

  if (steps.some((step) => step.type === 'grant') && !config.target.packageId) {
    return refusal(
      'This routine grants permissions, but no target package is configured — set one in Settings → Target.'
    )
  }

  const needsSourceRoot = steps.some(
    (step) => step.type === 'push' && !path.isAbsolute(step.source)
  )
  if (needsSourceRoot && !sourceRoot) {
    return refusal(
      'This routine pushes from a relative path, but no source root is configured — set one in Settings → Provisioning.'
    )
  }

  const context: RunContext = {
    adbPath: getAdbPath(config.adbPath),
    deviceArgs: config.currentDeviceId ? ['-s', config.currentDeviceId] : [],
    packageId: config.target.packageId,
    sourceRoot,
    timeoutMs: config.behavior.provisionTimeoutMs
  }

  logger.info(`Running provisioning routine: ${steps.length} step(s)`)
  const results: ProvisionStepResult[] = []

  for (const [index, step] of steps.entries()) {
    const label = describeStep(step)
    options.onProgress?.({ index, total: steps.length, label, type: step.type })
    logger.info(`Provision step ${index + 1}/${steps.length}: ${label}`)

    const startedAt = Date.now()
    const outcome = await runStep(step, context)
    const result: ProvisionStepResult = {
      id: step.id,
      index,
      type: step.type,
      label,
      durationMs: Date.now() - startedAt,
      ...outcome
    }

    if (!result.success && step.type === 'shell' && step.continueOnError) {
      // The `mkdir` case: a step whose failure is expected often enough that the
      // hand-run script ignored it too.
      result.continued = true
      results.push(result)
      logger.warn(`Provision step ${index + 1} failed, continuing: ${result.error}`)
      continue
    }

    results.push(result)

    if (!result.success) {
      // Stopping is the policy, not a fallback (§1.12 one layer out): a client that is still stopped can be fixed and re-run, a half-provisioned...
      logger.error(`Provision step ${index + 1} failed: ${result.error}`)
      return {
        success: false,
        steps: results,
        failedIndex: index,
        error: `Step ${index + 1} of ${steps.length} failed (${label}): ${result.error}`
      }
    }

    logger.info(`Provision step ${index + 1} completed in ${result.durationMs}ms`)
  }

  logger.info('Provisioning routine completed')
  return { success: true, steps: results }
}

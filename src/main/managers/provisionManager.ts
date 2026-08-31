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

interface AdbRun {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  spawnError?: string
}

const stripAdbChatter = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\* daemon/.test(line) && !/^adb server/.test(line))
    .join('\n')
    .trim()

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

      // On Windows, killing only adb leaves its child processes running.
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

  // Some adb commands report failure in their output while exiting with code 0.
  if (FAILURE_LINE.test(output)) {
    return { success: false, output, error: output }
  }

  return { success: true, output }
}

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
      result.continued = true
      results.push(result)
      logger.warn(`Provision step ${index + 1} failed, continuing: ${result.error}`)
      continue
    }

    results.push(result)

    if (!result.success) {
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

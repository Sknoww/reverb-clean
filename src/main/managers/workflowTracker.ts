import { execFile, spawn, ChildProcess } from 'child_process'
import logger from '../logger'
import { getAdbPath } from '../utils/adbUtils'
import { loadConfig } from './configManager'
import { WorkflowState } from '../types'

const STEP_PATTERN = /Transitioning: .*?->\s*(\S+)/
// Workflow names contain spaces, so capture to end of line.
const WORKFLOW_PATTERN = /setup\(\) - parent: (.+?)\s*$/
const PID_RETRY_MS = 3000

export function parseWorkflowLine(line: string): Partial<WorkflowState> {
  const update: Partial<WorkflowState> = {}
  const step = STEP_PATTERN.exec(line)
  if (step) update.step = step[1]
  const workflow = WORKFLOW_PATTERN.exec(line)
  if (workflow) update.workflow = workflow[1]
  return update
}

const EMPTY: WorkflowState = {}

let onState: ((state: WorkflowState) => void) | null = null
let trackedKey = ''
let generation = 0
let proc: ChildProcess | undefined
let retryTimer: NodeJS.Timeout | undefined
let monitorTimer: NodeJS.Timeout | undefined
let state: WorkflowState = EMPTY

function publish(next: WorkflowState): void {
  if (next.workflow === state.workflow && next.step === state.step) return
  state = next
  onState?.(state)
}

function stop(): void {
  generation++
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = undefined
  if (monitorTimer) clearTimeout(monitorTimer)
  monitorTimer = undefined
  proc?.kill()
  proc = undefined
  publish(EMPTY)
}

function findPid(adb: string, deviceId: string, packageId: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      adb,
      ['-s', deviceId, 'shell', 'pidof', '-s', packageId],
      { timeout: 5000 },
      (error, stdout) => {
        const pid = stdout?.trim()
        resolve(!error && pid && /^\d+$/.test(pid) ? pid : undefined)
      }
    )
  })
}

async function attach(deviceId: string, packageId: string, gen: number): Promise<void> {
  const adb = getAdbPath(loadConfig().adbPath)
  const pid = await findPid(adb, deviceId, packageId)
  if (gen !== generation) return

  const retry = (): void => {
    retryTimer = setTimeout(() => void attach(deviceId, packageId, gen), PID_RETRY_MS)
  }
  if (!pid) return retry()

  const child = spawn(adb, ['-s', deviceId, 'logcat', '-v', 'brief', `--pid=${pid}`])
  proc = child
  const monitor = (): void => {
    monitorTimer = setTimeout(async () => {
      const current = await findPid(adb, deviceId, packageId)
      if (gen !== generation || proc !== child) return
      if (current === pid) return monitor()
      proc = undefined
      child.kill()
      publish(EMPTY)
      void attach(deviceId, packageId, gen)
    }, PID_RETRY_MS)
  }
  monitor()
  let buffer = ''
  child.stdout?.on('data', (data: Buffer) => {
    if (gen !== generation) return
    buffer += data.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    let next = state
    for (const line of lines) next = { ...next, ...parseWorkflowLine(line) }
    publish(next)
  })
  const ended = (): void => {
    if (gen !== generation || proc !== child) return
    proc = undefined
    if (monitorTimer) clearTimeout(monitorTimer)
    monitorTimer = undefined
    publish(EMPTY)
    retry()
  }
  child.on('error', (error) => {
    logger.warn('Workflow logcat failed', { error: error.message })
    ended()
  })
  child.on('close', ended)
}

export function setWorkflowListener(listener: ((state: WorkflowState) => void) | null): void {
  onState = listener
}

export function watchWorkflow(deviceId: string, packageId: string): void {
  const key = deviceId && packageId ? `${deviceId}\n${packageId}` : ''
  if (key === trackedKey) {
    if (key) onState?.(state)
    return
  }
  trackedKey = key
  stop()
  if (key) void attach(deviceId, packageId, generation)
}

export function disposeWorkflowTracker(): void {
  trackedKey = ''
  stop()
  onState = null
}

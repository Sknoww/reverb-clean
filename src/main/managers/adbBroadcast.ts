import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import logger from '../logger'

export interface BroadcastResult {
  success: boolean
  output?: string
  error?: string
}

export interface BroadcastRequest {
  adbPath: string
  deviceId: string
  intent: string
  type: 'barcode' | 'speech'
  value: string
  timeoutMs: number
}

interface ExecFileResult {
  stdout: string
  stderr: string
}

export type BroadcastExecutor = (
  file: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean }
) => Promise<ExecFileResult>

interface BroadcastLogger {
  info: (message: string, meta?: Record<string, unknown>) => unknown
  error: (message: string, meta?: Record<string, unknown>) => unknown
}

const execFile = promisify(execFileCallback) as BroadcastExecutor

/** Quote one argv value for the Android-side shell. No host shell sees this string. */
export const quoteRemoteShellArg = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

export const buildBroadcastArgs = (request: BroadcastRequest): string[] => {
  const deviceArgs = request.deviceId ? ['-s', request.deviceId] : []
  // adb joins arguments following `shell` into one remote command without escaping them.
  // Quote the two configured/arbitrary values here so the Android shell passes each byte-for-byte to `am`.
  const remoteCommand = [
    'am broadcast -a',
    quoteRemoteShellArg(request.intent),
    '--es data',
    quoteRemoteShellArg(request.value)
  ].join(' ')

  return [...deviceArgs, 'shell', remoteCommand]
}

/** Run a command broadcast without exposing its payload to a host shell, logs, or errors. */
export const runAdbBroadcast = async (
  request: BroadcastRequest,
  dependencies: { execute?: BroadcastExecutor; log?: BroadcastLogger } = {}
): Promise<BroadcastResult> => {
  const execute = dependencies.execute ?? execFile
  const log = dependencies.log ?? logger
  const args = buildBroadcastArgs(request)

  log.info('Executing ADB command broadcast', {
    type: request.type,
    payloadLength: Buffer.byteLength(request.value, 'utf8'),
    deviceSelected: Boolean(request.deviceId)
  })

  try {
    const { stdout, stderr } = await execute(request.adbPath, args, {
      timeout: request.timeoutMs,
      windowsHide: true
    })

    if (stderr && stderr.toLowerCase().includes('error')) {
      log.error('ADB command broadcast reported an error', { type: request.type })
      return { success: false, error: 'ADB command broadcast failed.' }
    }

    log.info('ADB command broadcast completed', { type: request.type })
    return { success: true, output: stdout }
  } catch (error: unknown) {
    const failure =
      typeof error === 'object' && error !== null
        ? (error as { killed?: unknown; signal?: unknown })
        : undefined
    const timedOut = Boolean(failure?.killed || failure?.signal)
    log.error('ADB command broadcast failed', { type: request.type, timedOut })
    return {
      success: false,
      error: timedOut
        ? 'adb did not respond in time — check the device connection, or raise the ADB timeout in Settings.'
        : 'ADB command broadcast failed.'
    }
  }
}

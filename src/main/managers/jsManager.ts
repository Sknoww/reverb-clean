import { spawn } from 'child_process'
import logger from '../logger'
import { getAdbPath } from '../utils/adbUtils'
import { loadConfig } from './configManager'
import { JsExecutionResult } from '../types'

const RESULT_REGEX = /\[.+\]:\s*(.+)/g

export async function executeJsScript(
  script: string,
  deviceId: string
): Promise<JsExecutionResult> {
  return new Promise<JsExecutionResult>((resolve) => {
    const isSingleExpression = !script.includes('\n')

    const wrappedScript = isSingleExpression ? `JSON.stringify((${script}))` : script
    const encoded = Buffer.from(wrappedScript, 'utf8').toString('base64')

    const config = loadConfig()
    const adbPath = getAdbPath(config.adbPath)
    const timeoutMs = config.behavior.jsTimeoutMs

    const providerUri = config.target.scriptProviderUri
    if (!providerUri) {
      resolve({
        success: false,
        error: 'noTarget',
        message: 'No script provider configured — set one in Settings → Target.'
      })
      return
    }

    const args = [
      '-s',
      deviceId,
      'shell',
      'content',
      'query',
      '--uri',
      providerUri,
      '--where',
      encoded
    ]

    logger.info('Executing JS script via content provider', { deviceId })
    const child = spawn(adbPath, args)

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid!), '/f', '/t'])
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

      if (timedOut) {
        logger.warn('JS execution timed out', { deviceId })
        resolve({ success: false, timedOut: true })
        return
      }

      if (code !== 0 || (stderr && stderr.toLowerCase().includes('error'))) {
        const isNotFound = stderr.includes('not found') || stderr.includes('no devices')
        logger.error('ADB content query failed', { stderr, code })
        resolve({
          success: false,
          error: isNotFound ? 'deviceNotFound' : 'adbFailure',
          message: stderr || `exit code ${code}`
        })
        return
      }

      const normalized = stdout.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const stripped = normalized
        .split('\n')
        .filter((l) => !l.startsWith('* daemon') && !l.startsWith('adb server') && l.trim() !== '')
        .join('\n')

      const matches = [...stripped.matchAll(RESULT_REGEX)]
      const lastMatch = matches.at(-1)

      if (!lastMatch) {
        logger.warn('No result line found in stdout', { stdout })
        resolve({ success: false, error: 'parseError', rawOutput: stdout })
        return
      }

      const rawValue = lastMatch[1].trim()
      try {
        const parsed = JSON.parse(rawValue)
        resolve({ success: true, result: parsed })
      } catch {
        resolve({ success: true, result: rawValue })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      logger.error('Failed to spawn ADB process', err)
      resolve({ success: false, error: 'adbFailure', message: err.message })
    })
  })
}

import { describe, expect, it, vi } from 'vitest'
import type { BroadcastExecutor } from './adbBroadcast'

vi.mock('../logger', () => ({ default: { info: vi.fn(), error: vi.fn() } }))

import { buildBroadcastArgs, quoteRemoteShellArg, runAdbBroadcast } from './adbBroadcast'

const request = {
  adbPath: 'C:\\Program Files\\platform-tools\\adb.exe',
  deviceId: 'device-123',
  intent: 'frontline.intent.action.BARCODE',
  type: 'barcode' as const,
  value: `quote" single' slash\\ dollar$ semicolon; amp& pipe| $(host) \`host\``,
  timeoutMs: 1234
}

const recordingLogger = () => {
  const entries: unknown[] = []
  return {
    entries,
    logger: {
      info: (message: string, meta?: Record<string, unknown>) => entries.push({ message, meta }),
      error: (message: string, meta?: Record<string, unknown>) => entries.push({ message, meta })
    }
  }
}

describe('ADB command broadcasts', () => {
  it('quotes arbitrary values for the remote shell', () => {
    expect(quoteRemoteShellArg("a'b")).toBe("'a'\\''b'")
    expect(quoteRemoteShellArg('$/;&|`')).toBe("'$/;&|`'")
  })

  it('uses execFile argv without a host shell and never logs the payload', async () => {
    const calls: unknown[][] = []
    const execute: BroadcastExecutor = vi.fn(async (...args) => {
      calls.push(args)
      return { stdout: 'Broadcast completed: result=0', stderr: '' }
    })
    const { entries, logger } = recordingLogger()

    const result = await runAdbBroadcast(request, { execute, log: logger })

    expect(result).toEqual({ success: true, output: 'Broadcast completed: result=0' })
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe(request.adbPath)
    expect(calls[0][1]).toEqual(buildBroadcastArgs(request))
    expect(calls[0][1]).toEqual([
      '-s',
      'device-123',
      'shell',
      `am broadcast -a 'frontline.intent.action.BARCODE' --es data 'quote" single'\\'' slash\\ dollar$ semicolon; amp& pipe| $(host) \`host\`'`
    ])
    expect(calls[0][2]).toEqual({ timeout: 1234, windowsHide: true })
    expect(JSON.stringify(entries)).not.toContain(request.value)
    expect(entries[0]).toMatchObject({
      meta: { type: 'barcode', payloadLength: Buffer.byteLength(request.value, 'utf8') }
    })
  })

  it('redacts payloads from stderr, thrown errors, and logs', async () => {
    for (const execute of [
      vi.fn(async () => ({ stdout: '', stderr: `error near ${request.value}` })),
      vi.fn(async () => {
        throw new Error(`could not execute ${request.value}`)
      })
    ]) {
      const { entries, logger } = recordingLogger()
      const result = await runAdbBroadcast(request, {
        execute: execute as BroadcastExecutor,
        log: logger
      })
      const visible = JSON.stringify({ result, entries })
      expect(result.success).toBe(false)
      expect(visible).not.toContain(request.value)
      expect(visible).not.toContain('single')
    }
  })
})

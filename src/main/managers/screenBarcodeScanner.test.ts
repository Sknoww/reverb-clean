import type { DesktopCapturerSource, Display } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const log = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }))
vi.mock('../logger', () => ({ default: log }))
vi.mock('electron', () => ({
  desktopCapturer: { getSources: vi.fn() },
  screen: { getAllDisplays: vi.fn() },
  systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') }
}))

import { scanScreenBarcodes } from './screenBarcodeScanner'

const position = {
  topLeft: { x: 1, y: 1 },
  topRight: { x: 10, y: 1 },
  bottomLeft: { x: 1, y: 10 },
  bottomRight: { x: 10, y: 10 }
}

const positionAt = (x: number, y: number) => ({
  topLeft: { x, y },
  topRight: { x: x + 9, y },
  bottomLeft: { x, y: y + 9 },
  bottomRight: { x: x + 9, y: y + 9 }
})

const display = (id: number, width: number, height: number, scaleFactor: number): Display =>
  ({
    id,
    size: { width, height },
    bounds: { x: 0, y: 0, width, height },
    scaleFactor
  }) as Display

const source = (displayId: number, marker: number, empty = false): DesktopCapturerSource =>
  ({
    display_id: String(displayId),
    thumbnail: {
      isEmpty: () => empty,
      getSize: () => ({ width: 100, height: 100 }),
      toPNG: () => Buffer.from([marker])
    }
  }) as DesktopCapturerSource

const captureWindow = (events: string[] = []) => {
  let destroyed = false
  return {
    window: {
      isDestroyed: () => destroyed,
      isVisible: () => true,
      isMinimized: () => false,
      hide: vi.fn(() => events.push('hide')),
      show: vi.fn(() => events.push('show')),
      focus: vi.fn(() => events.push('focus')),
      restore: vi.fn(() => events.push('restore'))
    },
    destroy: () => {
      destroyed = true
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('screenBarcodeScanner', () => {
  it('captures each display at physical-pixel dimensions, restores Reverb, then decodes', async () => {
    const events: string[] = []
    const { window } = captureWindow(events)
    const displays = [display(11, 1920, 1080, 1), display(22, 1440, 900, 2)]
    const getSources = vi.fn(async () => [source(11, 1), source(22, 2)])
    const decode = vi.fn(async (input: Uint8Array | ArrayBuffer) => {
      const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input
      events.push(`decode-${bytes[0]}`)
      return {
        status: 'found' as const,
        barcode: {
          text: bytes[0] === 1 ? 'matrix payload' : 'qr payload',
          format: bytes[0] === 1 ? 'DataMatrix' : 'QRCode',
          symbology: bytes[0] === 1 ? 'DataMatrix' : 'QRCode',
          position
        }
      }
    })
    const progress: string[] = []

    const result = await scanScreenBarcodes(window, (stage) => progress.push(stage), {
      platform: 'win32',
      getDisplays: () => displays,
      getSources,
      getPermissionStatus: () => 'granted',
      decode,
      delay: async () => undefined
    })

    expect(getSources).toHaveBeenNthCalledWith(1, {
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
      fetchWindowIcons: false
    })
    expect(getSources).toHaveBeenNthCalledWith(2, {
      types: ['screen'],
      thumbnailSize: { width: 2880, height: 1800 },
      fetchWindowIcons: false
    })
    expect(progress).toEqual(['capturing', 'decoding'])
    expect(events).toEqual(['hide', 'show', 'focus', 'decode-1', 'decode-2'])
    expect(result).toMatchObject({
      status: 'multiple',
      barcodes: [
        { text: 'matrix payload', displayId: '11', displayNumber: 1 },
        { text: 'qr payload', displayId: '22', displayNumber: 2 }
      ]
    })
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('matrix payload')
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('qr payload')
  })

  it('collapses identical payloads found on more than one display', async () => {
    const { window } = captureWindow()
    const result = await scanScreenBarcodes(window, undefined, {
      platform: 'win32',
      getDisplays: () => [display(11, 100, 100, 1), display(22, 100, 100, 1)],
      getSources: vi.fn(async () => [source(11, 1), source(22, 2)]),
      getPermissionStatus: () => 'granted',
      decode: vi.fn(async () => ({
        status: 'found' as const,
        barcode: {
          text: 'same payload',
          format: 'QRCode',
          symbology: 'QRCode',
          position
        }
      })),
      delay: async () => undefined
    })

    expect(result).toMatchObject({
      status: 'found',
      barcode: { text: 'same payload', displayId: '11', displayNumber: 1 }
    })
  })

  it('orders choices by display, then top-to-bottom and left-to-right', async () => {
    const { window } = captureWindow()
    const decode = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'multiple',
        barcodes: [
          {
            text: 'lower',
            format: 'QRCode',
            symbology: 'QRCode',
            position: positionAt(5, 80)
          },
          {
            text: 'upper-right',
            format: 'QRCode',
            symbology: 'QRCode',
            position: positionAt(60, 10)
          },
          {
            text: 'upper-left',
            format: 'DataMatrix',
            symbology: 'DataMatrix',
            position: positionAt(10, 10)
          }
        ]
      })
      .mockResolvedValueOnce({
        status: 'found',
        barcode: {
          text: 'second display',
          format: 'QRCode',
          symbology: 'QRCode',
          position: positionAt(0, 0)
        }
      })

    const result = await scanScreenBarcodes(window, undefined, {
      platform: 'win32',
      getDisplays: () => [display(11, 100, 100, 1), display(22, 100, 100, 1)],
      getSources: vi.fn(async () => [source(11, 1), source(22, 2)]),
      getPermissionStatus: () => 'granted',
      decode,
      delay: async () => undefined
    })

    expect(result.status).toBe('multiple')
    if (result.status === 'multiple') {
      expect(result.barcodes.map(({ text, displayNumber }) => ({ text, displayNumber }))).toEqual([
        { text: 'upper-left', displayNumber: 1 },
        { text: 'upper-right', displayNumber: 1 },
        { text: 'lower', displayNumber: 1 },
        { text: 'second display', displayNumber: 2 }
      ])
    }
  })

  it('attempts macOS capture before returning denied so TCC can register the app', async () => {
    const events: string[] = []
    const { window } = captureWindow(events)
    const captureMac = vi.fn(async () => ({ status: 'capture-failed' as const }))

    const result = await scanScreenBarcodes(window, undefined, {
      platform: 'darwin',
      getPermissionStatus: () => 'denied',
      getDisplays: () => [display(11, 100, 100, 1)],
      captureMac,
      delay: async () => undefined
    })

    expect(result).toEqual({ status: 'permission-denied', permission: 'denied' })
    expect(captureMac).toHaveBeenCalledOnce()
    expect(events).toEqual(['hide', 'show', 'focus'])
  })

  it('uses native macOS frames without touching Electron capture', async () => {
    const { window } = captureWindow()
    const getSources = vi.fn()
    const captureMac = vi.fn(async () => [
      {
        displayId: '11',
        displayNumber: 1,
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 2,
        bytes: Buffer.from('native png')
      }
    ])

    const result = await scanScreenBarcodes(window, undefined, {
      platform: 'darwin',
      getPermissionStatus: () => 'granted',
      getDisplays: () => [display(11, 100, 100, 2)],
      getSources,
      captureMac,
      decode: vi.fn(async () => ({ status: 'not-found' as const })),
      delay: async () => undefined
    })

    expect(result).toEqual({ status: 'not-found' })
    expect(captureMac).toHaveBeenCalledOnce()
    expect(getSources).not.toHaveBeenCalled()
  })

  it('does not attempt macOS capture when access is restricted', async () => {
    const { window } = captureWindow()
    const captureMac = vi.fn()

    const result = await scanScreenBarcodes(window, undefined, {
      platform: 'darwin',
      getPermissionStatus: () => 'restricted',
      getDisplays: () => [display(11, 100, 100, 1)],
      captureMac,
      delay: async () => undefined
    })

    expect(result).toEqual({ status: 'permission-denied', permission: 'restricted' })
    expect(window.hide).not.toHaveBeenCalled()
    expect(captureMac).not.toHaveBeenCalled()
  })

  it('restores and refocuses the same window after a thrown capture error', async () => {
    const events: string[] = []
    const { window } = captureWindow(events)

    const result = await scanScreenBarcodes(window, undefined, {
      platform: 'win32',
      getPermissionStatus: () => 'granted',
      getDisplays: () => [display(11, 100, 100, 1)],
      getSources: vi.fn(async () => {
        throw new Error('capture exploded')
      }),
      delay: async () => undefined
    })

    expect(result).toEqual({ status: 'capture-failed' })
    expect(events).toEqual(['hide', 'show', 'focus'])
    expect(log.error).toHaveBeenCalledWith('Could not capture displays for barcode scan', {
      error: 'capture exploded'
    })
  })

  it('returns cancelled without decoding when the invoking window closes during capture', async () => {
    const state = captureWindow()
    const decode = vi.fn()

    const result = await scanScreenBarcodes(state.window, undefined, {
      platform: 'win32',
      getPermissionStatus: () => 'granted',
      getDisplays: () => [display(11, 100, 100, 1)],
      getSources: vi.fn(async () => [source(11, 1)]),
      decode,
      delay: async () => state.destroy()
    })

    expect(result).toEqual({ status: 'cancelled' })
    expect(decode).not.toHaveBeenCalled()
    expect(state.window.show).not.toHaveBeenCalled()
  })
})

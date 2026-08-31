import type { Rectangle } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const image = vi.hoisted(() => ({
  crop: vi.fn(() => ({ toPNG: () => Buffer.from('cropped') })),
  getSize: vi.fn(() => ({ width: 2400, height: 1600 }))
}))
const log = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }))

vi.mock('../logger', () => ({ default: log }))
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  desktopCapturer: { getSources: vi.fn() },
  nativeImage: { createFromBuffer: vi.fn(() => image) },
  screen: {
    getAllDisplays: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn()
  },
  systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') }
}))

import {
  cropRegion,
  isValidRegionSelection,
  selectScreenBarcodeRegion
} from './regionBarcodeScanner'
import type { ScreenCaptureFrame } from './screenBarcodeScanner'

const frame = (bounds: Rectangle, scaleFactor = 2): ScreenCaptureFrame => ({
  displayId: '22',
  displayNumber: 2,
  bounds,
  scaleFactor,
  bytes: Buffer.from('frame')
})

const barcode = (text: string, x: number) => ({
  text,
  format: 'QRCode' as const,
  symbology: 'QRCode' as const,
  position: {
    topLeft: { x, y: 0 },
    topRight: { x: x + 1, y: 0 },
    bottomLeft: { x, y: 1 },
    bottomRight: { x: x + 1, y: 1 }
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('regionBarcodeScanner', () => {
  it('converts local DIP coordinates to native pixels before cropping', () => {
    const result = cropRegion(frame({ x: -1440, y: -300, width: 1200, height: 800 }), {
      x: 10.25,
      y: 20.75,
      width: 100.25,
      height: 50.25
    })

    expect(image.crop).toHaveBeenCalledWith({ x: 20, y: 41, width: 201, height: 101 })
    expect(result).toEqual(Buffer.from('cropped'))
  })

  it('keeps full-frame and bottom-right edge crops inside the native image', () => {
    cropRegion(frame({ x: -1920, y: -400, width: 1920, height: 1280 }, 1.25), {
      x: 0,
      y: 0,
      width: 1920,
      height: 1280
    })
    cropRegion(frame({ x: 0, y: 0, width: 1200, height: 800 }, 2), {
      x: 1190,
      y: 790,
      width: 10,
      height: 10
    })

    expect(image.crop).toHaveBeenNthCalledWith(1, {
      x: 0,
      y: 0,
      width: 2400,
      height: 1600
    })
    expect(image.crop).toHaveBeenNthCalledWith(2, {
      x: 2380,
      y: 1580,
      width: 20,
      height: 20
    })
  })

  it('accepts edge selections and rejects clicks, undersized regions, and boundary crossings', () => {
    const captured = frame({ x: -1920, y: 0, width: 1920, height: 1080 }, 1)

    expect(isValidRegionSelection(captured, { x: 0, y: 0, width: 1920, height: 1080 })).toBe(true)
    expect(isValidRegionSelection(captured, { x: 10, y: 10, width: 0, height: 0 })).toBe(false)
    expect(isValidRegionSelection(captured, { x: 10, y: 10, width: 7, height: 20 })).toBe(false)
    expect(isValidRegionSelection(captured, { x: 1900, y: 10, width: 40, height: 40 })).toBe(false)
    expect(isValidRegionSelection(captured, { x: Number.NaN, y: 0, width: 20, height: 20 })).toBe(
      false
    )
  })

  it('releases frames and restores the invoking window after a thrown decoder failure', async () => {
    const events: string[] = []
    const captured = [frame({ x: 0, y: 0, width: 1200, height: 800 })]
    const window = {
      isVisible: () => true,
      isMinimized: () => false,
      isDestroyed: () => false,
      hide: vi.fn(() => events.push('hide')),
      show: vi.fn(() => events.push('show')),
      focus: vi.fn(() => events.push('focus')),
      restore: vi.fn(() => events.push('restore'))
    }
    const progress: string[] = []

    const result = await selectScreenBarcodeRegion(
      window as unknown as import('electron').BrowserWindow,
      { preloadPath: 'preload', rendererFile: 'renderer' },
      (stage) => progress.push(stage),
      {
        platform: 'win32',
        getPermissionStatus: () => 'granted',
        capture: async () => captured,
        select: async (frames) => ({
          frame: frames[0],
          rect: { x: 10, y: 10, width: 100, height: 100 }
        }),
        crop: () => Buffer.from('crop'),
        decode: vi.fn(async () => {
          throw new Error('forced decoder failure')
        }),
        delay: async () => undefined
      }
    )

    expect(result).toEqual({ status: 'decoder-failed' })
    expect(progress).toEqual(['capturing', 'selecting', 'decoding'])
    expect(events).toEqual(['hide', 'show', 'focus'])
    expect(captured).toHaveLength(0)
    expect(log.error).toHaveBeenCalledWith('Barcode decoder threw for selected region', {
      displayId: '22',
      error: 'forced decoder failure'
    })
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('frame')
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('crop')
  })

  it('cancels silently without decoding and restores the current draft window', async () => {
    const events: string[] = []
    const captured = [frame({ x: 0, y: 0, width: 1200, height: 800 })]
    const decode = vi.fn()
    const window = {
      isVisible: () => true,
      isMinimized: () => false,
      isDestroyed: () => false,
      hide: vi.fn(() => events.push('hide')),
      show: vi.fn(() => events.push('show')),
      focus: vi.fn(() => events.push('focus')),
      restore: vi.fn()
    }

    const result = await selectScreenBarcodeRegion(
      window as unknown as import('electron').BrowserWindow,
      { preloadPath: 'preload', rendererFile: 'renderer' },
      undefined,
      {
        platform: 'win32',
        capture: async () => captured,
        select: async () => null,
        decode,
        delay: async () => undefined
      }
    )

    expect(result).toEqual({ status: 'cancelled' })
    expect(decode).not.toHaveBeenCalled()
    expect(captured).toHaveLength(0)
    expect(events).toEqual(['hide', 'show', 'focus'])
  })

  it('attempts macOS capture before returning denied so TCC can register the app', async () => {
    const events: string[] = []
    const captureMac = vi.fn(async () => ({ status: 'capture-failed' as const }))
    const window = {
      isVisible: () => true,
      isMinimized: () => false,
      isDestroyed: () => false,
      hide: vi.fn(() => events.push('hide')),
      show: vi.fn(() => events.push('show')),
      focus: vi.fn(() => events.push('focus')),
      restore: vi.fn()
    }

    const result = await selectScreenBarcodeRegion(
      window as unknown as import('electron').BrowserWindow,
      { preloadPath: 'preload', rendererFile: 'renderer' },
      undefined,
      {
        platform: 'darwin',
        getPermissionStatus: () => 'denied',
        captureMac,
        delay: async () => undefined
      }
    )

    expect(result).toEqual({ status: 'permission-denied', permission: 'denied' })
    expect(captureMac).toHaveBeenCalledOnce()
    expect(events).toEqual(['hide', 'show', 'focus'])
  })

  it.each([
    ['not-found', { status: 'not-found' as const }, { status: 'not-found' }],
    [
      'one',
      {
        status: 'found' as const,
        barcode: barcode('one', 0)
      },
      { status: 'found', barcode: { text: 'one', displayId: 'native-selection' } }
    ],
    [
      'many',
      {
        status: 'multiple' as const,
        barcodes: [barcode('right', 10), barcode('left', 0)]
      },
      {
        status: 'multiple',
        barcodes: [
          { text: 'left', displayId: 'native-selection' },
          { text: 'right', displayId: 'native-selection' }
        ]
      }
    ]
  ])('normalizes the native macOS %s decode outcome', async (_, decoded, expected) => {
    const window = {
      isVisible: () => true,
      isMinimized: () => false,
      isDestroyed: () => false,
      hide: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      restore: vi.fn()
    }

    const result = await selectScreenBarcodeRegion(
      window as unknown as import('electron').BrowserWindow,
      { preloadPath: 'unused', rendererFile: 'unused' },
      undefined,
      {
        platform: 'darwin',
        getPermissionStatus: () => 'granted',
        captureMac: async () => ({ status: 'captured', bytes: Buffer.from('native selection') }),
        decode: vi.fn(async () => decoded),
        select: vi.fn(),
        delay: async () => undefined
      }
    )

    expect(result).toMatchObject(expected)
  })
})

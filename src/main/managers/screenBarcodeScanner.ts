import {
  desktopCapturer,
  screen,
  systemPreferences,
  type BrowserWindow,
  type DesktopCapturerSource,
  type Display,
  type Rectangle
} from 'electron'
import logger from '../logger'
import { decodeBarcodes, type DecodedBarcode } from './barcodeScanner'
import { captureMacDisplays } from './macScreenshotCapture'

export type ScreenScanProgress = 'capturing' | 'selecting' | 'decoding'

export interface ScreenBarcode extends DecodedBarcode {
  displayId: string
  displayNumber: number
}

export type ScreenBarcodeScanResult =
  | { status: 'not-found' }
  | { status: 'found'; barcode: ScreenBarcode }
  | { status: 'multiple'; barcodes: ScreenBarcode[] }
  | { status: 'permission-denied'; permission: 'denied' | 'restricted' | 'not-determined' }
  | { status: 'capture-failed' }
  | { status: 'decoder-failed' }
  | { status: 'busy' }
  | { status: 'cancelled' }

interface CaptureWindow {
  isDestroyed: () => boolean
  isVisible: () => boolean
  isMinimized: () => boolean
  hide: () => void
  show: () => void
  focus: () => void
  restore: () => void
}

export interface ScreenCaptureFrame {
  displayId: string
  displayNumber: number
  bounds: Rectangle
  scaleFactor: number
  bytes: Buffer
}

interface ScannerDependencies {
  platform: NodeJS.Platform
  getDisplays: () => Display[]
  getSources: typeof desktopCapturer.getSources
  getPermissionStatus: () => string
  decode: typeof decodeBarcodes
  delay: (milliseconds: number) => Promise<void>
  captureMac: (displays: Display[]) => Promise<ScreenCaptureFrame[] | ScreenBarcodeScanResult>
}

const defaultDependencies: ScannerDependencies = {
  platform: process.platform,
  getDisplays: () => screen.getAllDisplays(),
  getSources: (options) => desktopCapturer.getSources(options),
  getPermissionStatus: () => systemPreferences.getMediaAccessStatus('screen'),
  decode: decodeBarcodes,
  delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  captureMac: captureMacDisplays
}

let scanInFlight = false

const permissionResult = (status: string): ScreenBarcodeScanResult => ({
  status: 'permission-denied',
  permission:
    status === 'restricted' ? 'restricted' : status === 'denied' ? 'denied' : 'not-determined'
})

const sourceForDisplay = (
  sources: DesktopCapturerSource[],
  display: Display,
  displayIndex: number
): DesktopCapturerSource | undefined => {
  const matched = sources.find((source) => source.display_id === String(display.id))
  if (matched) return matched

  if (sources.every((source) => !source.display_id)) return sources[displayIndex]
  return undefined
}

export const captureDisplays = async (
  dependencies: Pick<ScannerDependencies, 'getDisplays' | 'getSources'>
): Promise<ScreenCaptureFrame[] | ScreenBarcodeScanResult> => {
  const displays = dependencies.getDisplays()
  const frames: ScreenCaptureFrame[] = []

  for (const [displayIndex, display] of displays.entries()) {
    const thumbnailSize = {
      width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
      height: Math.max(1, Math.round(display.size.height * display.scaleFactor))
    }
    const sources = await dependencies.getSources({
      types: ['screen'],
      thumbnailSize,
      fetchWindowIcons: false
    })
    const source = sourceForDisplay(sources, display, displayIndex)

    if (!source || source.thumbnail.isEmpty()) {
      logger.error('Screen capture returned no frame', {
        displayId: String(display.id),
        requestedSize: thumbnailSize,
        sourceCount: sources.length
      })
      return { status: 'capture-failed' }
    }

    const capturedSize = source.thumbnail.getSize()
    logger.info('Captured display for barcode scan', {
      displayId: String(display.id),
      requestedSize: thumbnailSize,
      capturedSize
    })
    frames.push({
      displayId: String(display.id),
      displayNumber: displayIndex + 1,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
      bytes: source.thumbnail.toPNG()
    })
  }

  return frames
}

const restoreWindow = (window: CaptureWindow, wasVisible: boolean, wasMinimized: boolean): void => {
  if (window.isDestroyed() || !wasVisible) return
  if (wasMinimized) window.restore()
  window.show()
  window.focus()
}

export const normalizeBarcodes = (barcodes: ScreenBarcode[]): ScreenBarcode[] => {
  const sorted = [...barcodes].sort(
    (left, right) =>
      left.displayNumber - right.displayNumber ||
      left.position.topLeft.y - right.position.topLeft.y ||
      left.position.topLeft.x - right.position.topLeft.x
  )
  const payloads = new Set<string>()

  return sorted.filter((barcode) => {
    if (payloads.has(barcode.text)) return false
    payloads.add(barcode.text)
    return true
  })
}

export const scanScreenBarcodes = async (
  window: BrowserWindow | CaptureWindow,
  onProgress: (progress: ScreenScanProgress) => void = () => undefined,
  dependencyOverrides: Partial<ScannerDependencies> = {}
): Promise<ScreenBarcodeScanResult> => {
  if (scanInFlight) return { status: 'busy' }
  scanInFlight = true

  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  let frames: ScreenCaptureFrame[] = []

  try {
    if (dependencies.platform === 'darwin') {
      const permission = dependencies.getPermissionStatus()
      if (permission === 'restricted') {
        return permissionResult(permission)
      }
    }

    const wasVisible = window.isVisible()
    const wasMinimized = window.isMinimized()
    onProgress('capturing')

    try {
      window.hide()

      await dependencies.delay(120)
      const captured =
        dependencies.platform === 'darwin'
          ? await dependencies.captureMac(dependencies.getDisplays())
          : await captureDisplays(dependencies)
      if (!Array.isArray(captured)) {
        if (dependencies.platform === 'darwin') {
          const permission = dependencies.getPermissionStatus()
          if (permission !== 'granted') return permissionResult(permission)
        }
        return captured
      }
      frames = captured
    } catch (error) {
      logger.error('Could not capture displays for barcode scan', {
        error: error instanceof Error ? error.message : String(error)
      })
      if (dependencies.platform === 'darwin') {
        const permission = dependencies.getPermissionStatus()
        if (permission !== 'granted') return permissionResult(permission)
      }
      return { status: 'capture-failed' }
    } finally {
      restoreWindow(window, wasVisible, wasMinimized)
    }

    if (dependencies.platform === 'darwin') {
      const permission = dependencies.getPermissionStatus()
      if (permission !== 'granted') return permissionResult(permission)
    }

    if (window.isDestroyed()) return { status: 'cancelled' }

    onProgress('decoding')
    const barcodes: ScreenBarcode[] = []
    for (const frame of frames) {
      const decoded = await dependencies.decode(frame.bytes)
      if (decoded.status === 'error') {
        logger.error('Barcode decoder failed for captured display', { displayId: frame.displayId })
        return { status: 'decoder-failed' }
      }
      if (decoded.status === 'found') {
        barcodes.push({
          ...decoded.barcode,
          displayId: frame.displayId,
          displayNumber: frame.displayNumber
        })
      } else if (decoded.status === 'multiple') {
        barcodes.push(
          ...decoded.barcodes.map((barcode) => ({
            ...barcode,
            displayId: frame.displayId,
            displayNumber: frame.displayNumber
          }))
        )
      }
    }

    const normalized = normalizeBarcodes(barcodes)
    if (normalized.length === 0) return { status: 'not-found' }
    if (normalized.length === 1) return { status: 'found', barcode: normalized[0] }
    return { status: 'multiple', barcodes: normalized }
  } finally {
    // Release screenshot buffers after every outcome.
    frames.length = 0
    scanInFlight = false
  }
}

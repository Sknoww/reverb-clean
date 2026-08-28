import {
  BrowserWindow,
  desktopCapturer,
  nativeImage,
  screen,
  systemPreferences,
  type Rectangle
} from 'electron'
import logger from '../logger'
import { decodeBarcodes } from './barcodeScanner'
import {
  captureDisplays,
  normalizeBarcodes,
  type ScreenBarcode,
  type ScreenBarcodeScanResult,
  type ScreenCaptureFrame,
  type ScreenScanProgress
} from './screenBarcodeScanner'

export interface RegionSelectorInit {
  displayId: string
  displayNumber: number
  width: number
  height: number
  scaleFactor: number
  backgroundUrl: string
}

export type RegionSelection = Rectangle

interface RegionSelectorAssets {
  preloadPath: string
  rendererFile: string
  rendererUrl?: string
}

interface RegionScannerDependencies {
  platform: NodeJS.Platform
  getPermissionStatus: () => string
  capture: () => Promise<ScreenCaptureFrame[] | ScreenBarcodeScanResult>
  select: (
    frames: ScreenCaptureFrame[],
    assets: RegionSelectorAssets
  ) => Promise<{ frame: ScreenCaptureFrame; rect: RegionSelection } | null>
  crop: typeof cropRegion
  decode: typeof decodeBarcodes
  delay: (milliseconds: number) => Promise<void>
}

interface OverlayEntry {
  window: BrowserWindow
  frame: ScreenCaptureFrame
}

interface ActiveSelection {
  entries: Map<number, OverlayEntry>
  ownerId?: number
  settled: boolean
  resolve: (selection: { frame: ScreenCaptureFrame; rect: RegionSelection } | null) => void
}

let activeSelection: ActiveSelection | undefined
let regionScanInFlight = false

const closeOverlays = (session: ActiveSelection): void => {
  for (const { window } of session.entries.values()) {
    if (!window.isDestroyed()) window.destroy()
  }
  session.entries.clear()
}

const finishSelection = (
  session: ActiveSelection,
  selection: { frame: ScreenCaptureFrame; rect: RegionSelection } | null
): void => {
  if (session.settled) return
  session.settled = true
  session.resolve(selection)
}

const broadcastOwner = (session: ActiveSelection): void => {
  for (const [webContentsId, { window }] of session.entries) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('barcode:regionOwner', {
        owned: session.ownerId === webContentsId,
        blocked: session.ownerId !== undefined && session.ownerId !== webContentsId
      })
    }
  }
}

export const initializeRegionSelector = (webContentsId: number): RegionSelectorInit | null => {
  const entry = activeSelection?.entries.get(webContentsId)
  if (!entry) return null

  return {
    displayId: entry.frame.displayId,
    displayNumber: entry.frame.displayNumber,
    width: entry.frame.bounds.width,
    height: entry.frame.bounds.height,
    scaleFactor: entry.frame.scaleFactor,
    backgroundUrl: `data:image/png;base64,${entry.frame.bytes.toString('base64')}`
  }
}

export const claimRegionSelection = (webContentsId: number): boolean => {
  const session = activeSelection
  if (!session || session.settled || !session.entries.has(webContentsId)) return false
  if (session.ownerId !== undefined && session.ownerId !== webContentsId) return false
  session.ownerId = webContentsId
  broadcastOwner(session)
  return true
}

export const releaseRegionSelection = (webContentsId: number): void => {
  const session = activeSelection
  if (!session || session.settled || session.ownerId !== webContentsId) return
  session.ownerId = undefined
  broadcastOwner(session)
}

export const isValidRegionSelection = (frame: ScreenCaptureFrame, rect: RegionSelection): boolean =>
  [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
  rect.x >= 0 &&
  rect.y >= 0 &&
  rect.width >= 8 &&
  rect.height >= 8 &&
  rect.x + rect.width <= frame.bounds.width &&
  rect.y + rect.height <= frame.bounds.height

export const completeRegionSelection = (webContentsId: number, rect: RegionSelection): void => {
  const session = activeSelection
  const entry = session?.entries.get(webContentsId)
  if (!session || !entry || session.settled || session.ownerId !== webContentsId) return

  if (!isValidRegionSelection(entry.frame, rect)) {
    releaseRegionSelection(webContentsId)
    return
  }

  finishSelection(session, { frame: entry.frame, rect })
}

export const cancelRegionSelection = (webContentsId: number): void => {
  const session = activeSelection
  if (!session || !session.entries.has(webContentsId)) return
  finishSelection(session, null)
}

const loadOverlay = async (overlay: BrowserWindow, assets: RegionSelectorAssets): Promise<void> => {
  if (assets.rendererUrl) {
    const url = new URL(assets.rendererUrl)
    url.searchParams.set('regionSelector', '1')
    await overlay.loadURL(url.toString())
  } else {
    await overlay.loadFile(assets.rendererFile, { query: { regionSelector: '1' } })
  }
}

const selectRegion = async (
  frames: ScreenCaptureFrame[],
  assets: RegionSelectorAssets
): Promise<{ frame: ScreenCaptureFrame; rect: RegionSelection } | null> => {
  let resolveSelection!: (
    selection: { frame: ScreenCaptureFrame; rect: RegionSelection } | null
  ) => void
  const selection = new Promise<{ frame: ScreenCaptureFrame; rect: RegionSelection } | null>(
    (resolve) => {
      resolveSelection = resolve
    }
  )
  const session: ActiveSelection = {
    entries: new Map(),
    settled: false,
    resolve: resolveSelection
  }
  activeSelection = session

  const displayRemoved = (): void => finishSelection(session, null)
  screen.on('display-removed', displayRemoved)

  try {
    const loads = frames.map(async (frame) => {
      const overlay = new BrowserWindow({
        ...frame.bounds,
        frame: false,
        show: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        hasShadow: false,
        backgroundColor: '#000000',
        webPreferences: {
          preload: assets.preloadPath,
          sandbox: false,
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          webgl: false
        }
      })
      session.entries.set(overlay.webContents.id, { window: overlay, frame })
      overlay.on('closed', () => finishSelection(session, null))
      overlay.webContents.on('render-process-gone', () => finishSelection(session, null))
      await loadOverlay(overlay, assets)
      overlay.setAlwaysOnTop(true, 'screen-saver')
      return overlay
    })

    const overlays = await Promise.all(loads)
    for (const overlay of overlays) overlay.show()
    overlays[0]?.focus()
    return await selection
  } finally {
    screen.removeListener('display-removed', displayRemoved)
    closeOverlays(session)
    if (activeSelection === session) activeSelection = undefined
  }
}

export const cropRegion = (frame: ScreenCaptureFrame, rect: RegionSelection): Buffer => {
  const image = nativeImage.createFromBuffer(frame.bytes)
  const size = image.getSize()
  const x = Math.max(0, Math.floor(rect.x * frame.scaleFactor))
  const y = Math.max(0, Math.floor(rect.y * frame.scaleFactor))
  const width = Math.min(size.width - x, Math.ceil(rect.width * frame.scaleFactor))
  const height = Math.min(size.height - y, Math.ceil(rect.height * frame.scaleFactor))
  return image.crop({ x, y, width, height }).toPNG()
}

const permissionResult = (status: string): ScreenBarcodeScanResult => ({
  status: 'permission-denied',
  permission:
    status === 'restricted' ? 'restricted' : status === 'denied' ? 'denied' : 'not-determined'
})

export const selectScreenBarcodeRegion = async (
  window: BrowserWindow,
  assets: RegionSelectorAssets,
  onProgress: (progress: ScreenScanProgress) => void = () => undefined,
  dependencyOverrides: Partial<RegionScannerDependencies> = {}
): Promise<ScreenBarcodeScanResult> => {
  if (regionScanInFlight) return { status: 'busy' }
  regionScanInFlight = true
  let frames: ScreenCaptureFrame[] = []
  const wasVisible = window.isVisible()
  const wasMinimized = window.isMinimized()
  const dependencies: RegionScannerDependencies = {
    platform: process.platform,
    getPermissionStatus: () => systemPreferences.getMediaAccessStatus('screen'),
    capture: () =>
      captureDisplays({
        platform: process.platform,
        getDisplays: () => screen.getAllDisplays(),
        getSources: (options) => desktopCapturer.getSources(options),
        getPermissionStatus: () => systemPreferences.getMediaAccessStatus('screen'),
        decode: decodeBarcodes,
        delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
      }),
    select: selectRegion,
    crop: cropRegion,
    decode: decodeBarcodes,
    delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    ...dependencyOverrides
  }

  try {
    if (dependencies.platform === 'darwin') {
      const permission = dependencies.getPermissionStatus()
      if (permission === 'restricted') {
        return permissionResult(permission)
      }
    }

    onProgress('capturing')
    window.hide()
    await dependencies.delay(120)
    const captured = await dependencies.capture()
    if (!Array.isArray(captured)) {
      if (dependencies.platform === 'darwin') {
        const permission = dependencies.getPermissionStatus()
        if (permission !== 'granted') return permissionResult(permission)
      }
      return captured
    }
    frames = captured

    if (dependencies.platform === 'darwin') {
      const permission = dependencies.getPermissionStatus()
      if (permission !== 'granted') return permissionResult(permission)
    }

    onProgress('selecting')
    const selection = await dependencies.select(frames, assets)
    if (!selection) return { status: 'cancelled' }

    onProgress('decoding')
    let decoded: Awaited<ReturnType<typeof decodeBarcodes>>
    try {
      decoded = await dependencies.decode(dependencies.crop(selection.frame, selection.rect))
    } catch (error) {
      logger.error('Barcode decoder threw for selected region', {
        displayId: selection.frame.displayId,
        error: error instanceof Error ? error.message : String(error)
      })
      return { status: 'decoder-failed' }
    }
    if (decoded.status === 'error') {
      logger.error('Barcode decoder failed for selected region', {
        displayId: selection.frame.displayId
      })
      return { status: 'decoder-failed' }
    }
    if (decoded.status === 'not-found') return decoded

    const decodedBarcodes = decoded.status === 'found' ? [decoded.barcode] : decoded.barcodes
    const barcodes = normalizeBarcodes(
      decodedBarcodes.map<ScreenBarcode>((barcode) => ({
        ...barcode,
        displayId: selection.frame.displayId,
        displayNumber: selection.frame.displayNumber
      }))
    )
    if (barcodes.length === 1) return { status: 'found', barcode: barcodes[0] }
    return { status: 'multiple', barcodes }
  } catch (error) {
    logger.error('Region barcode scan failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    if (dependencies.platform === 'darwin') {
      const permission = dependencies.getPermissionStatus()
      if (permission !== 'granted') return permissionResult(permission)
    }
    return { status: 'capture-failed' }
  } finally {
    frames.length = 0
    if (!window.isDestroyed() && wasVisible) {
      if (wasMinimized) window.restore()
      window.show()
      window.focus()
    }
    regionScanInFlight = false
  }
}

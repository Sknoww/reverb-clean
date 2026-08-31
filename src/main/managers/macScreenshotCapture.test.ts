import type { Dirent, Stats } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Display } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('../logger', () => ({ default: log }))

import {
  captureMacDisplays,
  captureMacInteractiveRegion,
  MAC_CAPTURE_DIRECTORY_PREFIX,
  sweepStaleMacCaptureDirectories
} from './macScreenshotCapture'

type Overrides = NonNullable<Parameters<typeof captureMacInteractiveRegion>[0]>

const tempRoot = resolve('temporary root with spaces')
const captureDirectory = join(tempRoot, `${MAC_CAPTURE_DIRECTORY_PREFIX}abc123`)

const directoryEntry = (name: string): Dirent =>
  ({ name, isDirectory: () => true, isSymbolicLink: () => false }) as Dirent

const directoryStatus = (symbolicLink = false): Stats =>
  ({ isDirectory: () => true, isSymbolicLink: () => symbolicLink }) as Stats

const dependencies = (overrides: Partial<Overrides> = {}): Overrides => ({
  temporaryDirectory: () => tempRoot,
  run: vi.fn(async () => ({ exitCode: 0 })),
  makeDirectory: vi.fn(async () => captureDirectory),
  chmodDirectory: vi.fn(async () => undefined),
  readDirectory: vi.fn(async () => []) as unknown as Overrides['readDirectory'],
  fileStatus: vi.fn(async () => directoryStatus()) as unknown as Overrides['fileStatus'],
  read: vi.fn(async () => Buffer.from('png bytes')),
  unlinkFile: vi.fn(async () => undefined),
  removeDirectory: vi.fn(async () => undefined),
  ...overrides
})

const display = (id: number): Display =>
  ({
    id,
    bounds: { x: 0, y: 0, width: 100, height: 80 },
    size: { width: 100, height: 80 },
    scaleFactor: 2
  }) as Display

beforeEach(() => {
  vi.clearAllMocks()
})

describe('macScreenshotCapture', () => {
  it('uses the absolute executable and argv for an interactive path containing spaces', async () => {
    const seam = dependencies()

    const result = await captureMacInteractiveRegion(seam)

    expect(seam.run).toHaveBeenCalledWith('/usr/sbin/screencapture', [
      '-x',
      '-i',
      join(captureDirectory, 'selection.png')
    ])
    expect(seam.chmodDirectory).toHaveBeenCalledWith(captureDirectory, 0o700)
    expect(seam.unlinkFile).toHaveBeenCalledWith(join(captureDirectory, 'selection.png'))
    expect(seam.removeDirectory).toHaveBeenCalledWith(captureDirectory)
    expect(result).toEqual({ status: 'captured', bytes: Buffer.from('png bytes') })
  })

  it('captures numbered displays one at a time and cleans each PNG immediately', async () => {
    const seam = dependencies({
      read: vi
        .fn()
        .mockResolvedValueOnce(Buffer.from('first'))
        .mockResolvedValueOnce(Buffer.from('second'))
    })

    const result = await captureMacDisplays([display(11), display(22)], seam)

    expect(seam.run).toHaveBeenNthCalledWith(1, '/usr/sbin/screencapture', [
      '-x',
      '-D',
      '1',
      join(captureDirectory, 'display-1.png')
    ])
    expect(seam.run).toHaveBeenNthCalledWith(2, '/usr/sbin/screencapture', [
      '-x',
      '-D',
      '2',
      join(captureDirectory, 'display-2.png')
    ])
    expect(seam.unlinkFile).toHaveBeenCalledTimes(2)
    expect(seam.removeDirectory).toHaveBeenCalledWith(captureDirectory)
    expect(result).toMatchObject([
      { displayId: '11', displayNumber: 1, bytes: Buffer.from('first') },
      { displayId: '22', displayNumber: 2, bytes: Buffer.from('second') }
    ])
  })

  it('treats a missing interactive output as cancellation and still removes its directory', async () => {
    const missing = Object.assign(new Error('cancelled'), { code: 'ENOENT' })
    const seam = dependencies({ read: vi.fn(async () => Promise.reject(missing)) })

    const result = await captureMacInteractiveRegion(seam)

    expect(result).toEqual({ status: 'cancelled' })
    expect(seam.unlinkFile).not.toHaveBeenCalled()
    expect(seam.removeDirectory).toHaveBeenCalledWith(captureDirectory)
    expect(log.error).not.toHaveBeenCalled()
  })

  it('reports a command launch error and cleans the directory', async () => {
    const seam = dependencies({ run: vi.fn(async () => Promise.reject(new Error('spawn failed'))) })

    const result = await captureMacInteractiveRegion(seam)

    expect(result).toEqual({ status: 'capture-failed' })
    expect(seam.removeDirectory).toHaveBeenCalledWith(captureDirectory)
    expect(log.error).toHaveBeenCalledWith('Native interactive screenshot capture failed', {
      error: 'spawn failed'
    })
  })

  it('bounds stale cleanup and refuses a traversal or symbolic link candidate', async () => {
    const validEntries = Array.from({ length: 101 }, (_, index) =>
      directoryEntry(`${MAC_CAPTURE_DIRECTORY_PREFIX}${String(index).padStart(3, '0')}`)
    )
    const seam = dependencies({
      readDirectory: vi.fn(async () => [
        directoryEntry(`${MAC_CAPTURE_DIRECTORY_PREFIX}x/../../outside`),
        directoryEntry(`${MAC_CAPTURE_DIRECTORY_PREFIX}link`),
        ...validEntries
      ]) as unknown as Overrides['readDirectory'],
      fileStatus: vi.fn(async (path: import('node:fs').PathLike) =>
        directoryStatus(String(path).endsWith('link'))
      ) as unknown as Overrides['fileStatus']
    })

    await sweepStaleMacCaptureDirectories(seam)

    expect(seam.removeDirectory).toHaveBeenCalledTimes(98)
    expect(seam.removeDirectory).not.toHaveBeenCalledWith(resolve(tempRoot, '..', 'outside'))
    expect(seam.removeDirectory).not.toHaveBeenCalledWith(
      join(tempRoot, `${MAC_CAPTURE_DIRECTORY_PREFIX}link`)
    )
  })
})

import { execFile } from 'node:child_process'
import type { Dirent } from 'node:fs'
import { chmod, lstat, mkdtemp, readFile, readdir, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import type { Display } from 'electron'
import logger from '../logger'
import type { ScreenCaptureFrame } from './screenBarcodeScanner'

const SCREEN_CAPTURE_EXECUTABLE = '/usr/sbin/screencapture'
export const MAC_CAPTURE_DIRECTORY_PREFIX = 'reverb-screencapture-'
const MAX_STALE_DIRECTORIES_PER_SWEEP = 100

interface CommandResult {
  exitCode: number
}

interface MacCaptureDependencies {
  temporaryDirectory: () => string
  run: (executable: string, args: string[]) => Promise<CommandResult>
  makeDirectory: (prefix: string) => Promise<string>
  chmodDirectory: (path: string, mode: number) => Promise<void>
  readDirectory: typeof readdir
  fileStatus: typeof lstat
  read: (path: string) => Promise<Buffer>
  unlinkFile: (path: string) => Promise<void>
  removeDirectory: (path: string) => Promise<void>
}

const run = (executable: string, args: string[]): Promise<CommandResult> =>
  new Promise((resolveCommand, rejectCommand) => {
    execFile(executable, args, (error) => {
      if (!error) {
        resolveCommand({ exitCode: 0 })
        return
      }
      if (typeof error.code === 'number') {
        resolveCommand({ exitCode: error.code })
        return
      }
      rejectCommand(error)
    })
  })

const defaultDependencies: MacCaptureDependencies = {
  temporaryDirectory: tmpdir,
  run,
  makeDirectory: mkdtemp,
  chmodDirectory: chmod,
  readDirectory: readdir,
  fileStatus: lstat,
  read: readFile,
  unlinkFile: unlink,
  removeDirectory: (path) => rm(path, { recursive: true, force: true })
}

const activeDirectories = new Set<string>()

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const isMissingFile = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'

export const sweepStaleMacCaptureDirectories = async (
  dependencyOverrides: Partial<MacCaptureDependencies> = {}
): Promise<void> => {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  const temporaryRoot = resolve(dependencies.temporaryDirectory())
  let entries: Dirent[]

  try {
    entries = await dependencies.readDirectory(temporaryRoot, { withFileTypes: true })
  } catch (error) {
    logger.warn('Could not inspect temporary screenshot directories', {
      error: errorMessage(error)
    })
    return
  }

  const candidates = entries
    .filter((entry) => entry.name.startsWith(MAC_CAPTURE_DIRECTORY_PREFIX))
    .slice(0, MAX_STALE_DIRECTORIES_PER_SWEEP)

  for (const entry of candidates) {
    const candidate = resolve(temporaryRoot, entry.name)
    if (dirname(candidate) !== temporaryRoot || activeDirectories.has(candidate)) continue

    try {
      const status = await dependencies.fileStatus(candidate)
      if (!status.isDirectory() || status.isSymbolicLink()) continue
      await dependencies.removeDirectory(candidate)
    } catch (error) {
      logger.warn('Could not remove stale screenshot directory', {
        path: candidate,
        error: errorMessage(error)
      })
    }
  }
}

const withCaptureDirectory = async <T>(
  operation: (directory: string, dependencies: MacCaptureDependencies) => Promise<T>,
  dependencyOverrides: Partial<MacCaptureDependencies>
): Promise<T> => {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  await sweepStaleMacCaptureDirectories(dependencies)
  const temporaryRoot = resolve(dependencies.temporaryDirectory())
  const directory = resolve(
    await dependencies.makeDirectory(join(temporaryRoot, MAC_CAPTURE_DIRECTORY_PREFIX))
  )
  if (!directory.startsWith(`${temporaryRoot}${sep}`)) {
    throw new Error('Screenshot directory was created outside the OS temporary directory')
  }

  activeDirectories.add(directory)
  try {
    // Capture files contain screen contents, so keep their directory private.
    await dependencies.chmodDirectory(directory, 0o700)
    return await operation(directory, dependencies)
  } finally {
    activeDirectories.delete(directory)
    try {
      await dependencies.removeDirectory(directory)
    } catch (error) {
      logger.warn('Could not remove screenshot directory', {
        path: directory,
        error: errorMessage(error)
      })
    }
  }
}

const readAndUnlink = async (
  outputPath: string,
  dependencies: MacCaptureDependencies
): Promise<Buffer> => {
  const bytes = await dependencies.read(outputPath)
  await dependencies.unlinkFile(outputPath)
  return bytes
}

export type MacInteractiveCaptureResult =
  | { status: 'captured'; bytes: Buffer }
  | { status: 'cancelled' }
  | { status: 'capture-failed' }

export const captureMacInteractiveRegion = async (
  dependencyOverrides: Partial<MacCaptureDependencies> = {}
): Promise<MacInteractiveCaptureResult> => {
  try {
    return await withCaptureDirectory(async (directory, dependencies) => {
      const outputPath = join(directory, 'selection.png')
      await dependencies.run(SCREEN_CAPTURE_EXECUTABLE, ['-x', '-i', outputPath])
      try {
        return { status: 'captured', bytes: await readAndUnlink(outputPath, dependencies) }
      } catch (error) {
        if (isMissingFile(error)) return { status: 'cancelled' }
        throw error
      }
    }, dependencyOverrides)
  } catch (error) {
    logger.error('Native interactive screenshot capture failed', { error: errorMessage(error) })
    return { status: 'capture-failed' }
  }
}

export const captureMacDisplays = async (
  displays: Display[],
  dependencyOverrides: Partial<MacCaptureDependencies> = {}
): Promise<ScreenCaptureFrame[] | { status: 'capture-failed' }> => {
  try {
    return await withCaptureDirectory(async (directory, dependencies) => {
      const frames: ScreenCaptureFrame[] = []
      for (const [displayIndex, display] of displays.entries()) {
        const displayNumber = displayIndex + 1
        const outputPath = join(directory, `display-${displayNumber}.png`)
        const result = await dependencies.run(SCREEN_CAPTURE_EXECUTABLE, [
          '-x',
          '-D',
          String(displayNumber),
          outputPath
        ])
        if (result.exitCode !== 0) return { status: 'capture-failed' }

        frames.push({
          displayId: String(display.id),
          displayNumber,
          bounds: display.bounds,
          scaleFactor: display.scaleFactor,
          bytes: await readAndUnlink(outputPath, dependencies)
        })
      }
      return frames
    }, dependencyOverrides)
  } catch (error) {
    logger.error('Native display screenshot capture failed', { error: errorMessage(error) })
    return { status: 'capture-failed' }
  }
}

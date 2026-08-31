import { app, dialog } from 'electron'
import logger, { getLogsDirectory, silenceConsoleTransport } from './logger'

const BENIGN_STREAM_CODES = new Set(['EPIPE', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END'])

const isBenignStreamError = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' && BENIGN_STREAM_CODES.has(code)
}

const reportedBenignCodes = new Set<string>()

let fatalHandled = false

const logSafely = (level: 'error' | 'warn' | 'debug', message: string, meta: object): void => {
  try {
    logger[level](message, meta)
  } catch {
    // Crash reporting must still work when the logger is what failed.
  }
}

const describe = (error: Error): object => ({
  name: error.name,
  message: error.message,
  code: (error as NodeJS.ErrnoException).code,
  stack: error.stack
})

const handleBenign = (error: Error, origin: string): void => {
  const code = (error as NodeJS.ErrnoException).code as string
  const firstOfCode = !reportedBenignCodes.has(code)
  reportedBenignCodes.add(code)

  // Silence the failing transport before logging, or the report can trigger the same error.
  const consoleSilenced = silenceConsoleTransport()

  logSafely(firstOfCode ? 'warn' : 'debug', 'Ignoring stream write failure', {
    origin,
    consoleSilenced,
    ...describe(error)
  })
}

const handleFatal = (error: Error, origin: string): void => {
  logSafely('error', 'Uncaught exception in main process', { origin, ...describe(error) })

  if (fatalHandled) return
  fatalHandled = true

  // This is the only Electron dialog that is safe before the ready event.
  if (!app.isReady()) {
    dialog.showErrorBox(
      'Reverb failed to start',
      `${error.message}\n\nDetails were written to:\n${getLogsDirectory()}`
    )
    app.exit(1)
    return
  }

  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'Reverb',
    message: 'Reverb hit an unexpected error and needs to close.',
    detail: `${error.message}\n\nDetails were written to:\n${getLogsDirectory()}`,
    buttons: ['Restart', 'Quit'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })

  if (choice === 0) {
    // relaunch schedules the next instance but does not stop this one.
    app.relaunch()
  }

  // Avoid the normal shutdown path after an unrecoverable error.
  app.exit(choice === 0 ? 0 : 1)
}

export const installCrashHandler = (): void => {
  process.on('uncaughtException', (error, origin) => {
    if (isBenignStreamError(error)) {
      handleBenign(error, origin)
      return
    }
    handleFatal(error, origin)
  })

  // Electron does not promote unhandled rejections to uncaught exceptions.
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    logSafely('error', 'Unhandled promise rejection in main process', describe(error))
  })
}

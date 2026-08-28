import { app, dialog } from 'electron'
import logger, { getLogsDirectory, silenceConsoleTransport } from './logger'

/** Main-process crash handling (F4). */

/** Write failures that mean *nobody is reading*, not that the app is broken. */
const BENIGN_STREAM_CODES = new Set(['EPIPE', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END'])

const isBenignStreamError = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' && BENIGN_STREAM_CODES.has(code)
}

// Benign codes already reported this session.
const reportedBenignCodes = new Set<string>()

// Re-entry guard.
let fatalHandled = false

/** Logging must never be the thing that throws inside the crash handler — if the logger itself is what died (F4's own trigger), calling it... */
const logSafely = (level: 'error' | 'warn' | 'debug', message: string, meta: object): void => {
  try {
    logger[level](message, meta)
  } catch {
    // Nothing left to report through. Continue to the dialog regardless: the
    // user seeing *something* matters more than the log line.
  }
}

const describe = (error: Error): object => ({
  name: error.name,
  message: error.message,
  code: (error as NodeJS.ErrnoException).code,
  stack: error.stack
})

/** A stream write failed because nobody is reading (F4), handled so that the report itself can't cause the next one (F7). */
const handleBenign = (error: Error, origin: string): void => {
  const code = (error as NodeJS.ErrnoException).code as string
  const firstOfCode = !reportedBenignCodes.has(code)
  reportedBenignCodes.add(code)

  // Before the log call, not after — this is the write that would loop.
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

  // `showErrorBox` is the only dialog API documented as safe before the `ready` event, and a throw during startup is exactly when we can't...
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
    // `relaunch` only *schedules* the next instance — it does not quit, so the
    // exit below is what actually triggers it.
    app.relaunch()
  }

  // `exit`, not `quit`: quit runs the normal shutdown sequence, which means running more code inside a process we've just established is broken.
  app.exit(choice === 0 ? 0 : 1)
}

/** Install the handlers. */
export const installCrashHandler = (): void => {
  process.on('uncaughtException', (error, origin) => {
    if (isBenignStreamError(error)) {
      handleBenign(error, origin)
      return
    }
    handleFatal(error, origin)
  })

  // Electron sets Node's unhandled-rejection mode to `warn-with-error-code`, so a rejection never crashes and never reaches the handler...
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    logSafely('error', 'Unhandled promise rejection in main process', describe(error))
  })
}

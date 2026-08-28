import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger, format, Logger, transports } from 'winston'
import { LoggingConfig } from './types'

// Configuration options
interface LogConfig {
  maxLogAge: number // Maximum age of logs in days
  maxLogFiles: number // Maximum number of log files to keep
  cleanupInterval: number // Cleanup check interval in milliseconds
}

// Mutable, and deliberately not read from `configManager`: that module imports *this* one, so a reverse import would be a cycle.
const logConfig: LogConfig = {
  maxLogAge: 7, // Keep logs for 7 days
  maxLogFiles: 10, // Keep at most 10 log files
  cleanupInterval: 86400000 // Run cleanup once per day (24 hours in ms)
}

// Create logs directory if it doesn't exist
const logsDir: string = path.join(app.getPath('userData'), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Generate a unique filename based on timestamp
const timestamp: string = new Date().toISOString().replace(/:/g, '-')
const logFilePath: string = path.join(logsDir, `app-${timestamp}.log`)

// Create and configure the logger.
const consoleTransport = new transports.Console({ silent: app.isPackaged })
const fileTransport = new transports.File({ filename: logFilePath })

const logger: Logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [consoleTransport, fileTransport]
})

// Log cleanup function
const cleanupLogs = (): void => {
  try {
    logger.info('Starting log cleanup')

    // Read all files in the logs directory
    const files = fs.readdirSync(logsDir)

    // Get file stats for all log files
    const fileStats = files
      .filter((file) => file.endsWith('.log'))
      .map((file) => {
        const filePath = path.join(logsDir, file)
        const stats = fs.statSync(filePath)
        return {
          name: file,
          path: filePath,
          createTime: stats.birthtime,
          size: stats.size
        }
      })
      // Sort by creation time (oldest first)
      .sort((a, b) => a.createTime.getTime() - b.createTime.getTime())

    // Remove old files by date
    const now = new Date()
    const maxAgeMs = logConfig.maxLogAge * 24 * 60 * 60 * 1000

    fileStats.forEach((file) => {
      const fileAge = now.getTime() - file.createTime.getTime()
      if (fileAge > maxAgeMs) {
        logger.info(`Removing old log file: ${file.name}`)
        fs.unlinkSync(file.path)
      }
    })

    // If we still have too many files, remove the oldest ones
    const remainingFiles = fs.readdirSync(logsDir).filter((file) => file.endsWith('.log'))
    if (remainingFiles.length > logConfig.maxLogFiles) {
      // Re-read directory since we may have deleted files
      const filesToRemove = remainingFiles.length - logConfig.maxLogFiles
      const oldestFiles = fileStats
        .filter((file) => fs.existsSync(file.path))
        .slice(0, filesToRemove)

      oldestFiles.forEach((file) => {
        logger.info(`Removing excess log file: ${file.name}`)
        fs.unlinkSync(file.path)
      })
    }

    logger.info('Log cleanup completed')
  } catch (error) {
    logger.error('Error during log cleanup', { error })
  }
}

// Schedule periodic cleanup
const scheduleCleanup = (): NodeJS.Timeout => {
  return setInterval(cleanupLogs, logConfig.cleanupInterval)
}

// Run initial cleanup and schedule future cleanups
let cleanupTimer: NodeJS.Timeout | null = null

// Start cleanup when app is ready
app.whenReady().then(() => {
  cleanupLogs() // Run initial cleanup
  cleanupTimer = scheduleCleanup()
})

// Make sure to clear the interval when the app is about to quit
app.on('will-quit', () => {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
  }
})

/** Point the live logger at the config's logging block (18b). */
export const applyLoggingConfig = (logging: LoggingConfig | undefined): void => {
  if (!logging) return

  if (logger.level !== logging.level) {
    logger.info('Log level changed', { from: logger.level, to: logging.level })
    logger.level = logging.level
    consoleTransport.level = logging.level
    fileTransport.level = logging.level
  }

  const retentionChanged =
    logConfig.maxLogAge !== logging.maxAgeDays || logConfig.maxLogFiles !== logging.maxFiles

  logConfig.maxLogAge = logging.maxAgeDays
  logConfig.maxLogFiles = logging.maxFiles

  if (retentionChanged) cleanupLogs()
}

/** Stop writing to stdout for the rest of this session (F7). */
export const silenceConsoleTransport = (): boolean => {
  if (consoleTransport.silent) return false
  consoleTransport.silent = true
  return true
}

// Get the path to the logs directory
export const getLogsDirectory = (): string => {
  return logsDir
}

// Export both standard and custom loggers
export default logger

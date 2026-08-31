import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger, format, Logger, transports } from 'winston'
import { LoggingConfig } from './types'

interface LogConfig {
  maxLogAge: number
  maxLogFiles: number
  cleanupInterval: number
}

// Reading this from configManager would create a circular import.
const logConfig: LogConfig = {
  maxLogAge: 7,
  maxLogFiles: 10,
  cleanupInterval: 86400000
}

const logsDir: string = path.join(app.getPath('userData'), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const timestamp: string = new Date().toISOString().replace(/:/g, '-')
const logFilePath: string = path.join(logsDir, `app-${timestamp}.log`)

const consoleTransport = new transports.Console({ silent: app.isPackaged })
const fileTransport = new transports.File({ filename: logFilePath })

const logger: Logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [consoleTransport, fileTransport]
})

const cleanupLogs = (): void => {
  try {
    logger.info('Starting log cleanup')

    const files = fs.readdirSync(logsDir)

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
      .sort((a, b) => a.createTime.getTime() - b.createTime.getTime())

    const now = new Date()
    const maxAgeMs = logConfig.maxLogAge * 24 * 60 * 60 * 1000

    fileStats.forEach((file) => {
      const fileAge = now.getTime() - file.createTime.getTime()
      if (fileAge > maxAgeMs) {
        logger.info(`Removing old log file: ${file.name}`)
        fs.unlinkSync(file.path)
      }
    })

    const remainingFiles = fs.readdirSync(logsDir).filter((file) => file.endsWith('.log'))
    if (remainingFiles.length > logConfig.maxLogFiles) {
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

const scheduleCleanup = (): NodeJS.Timeout => {
  return setInterval(cleanupLogs, logConfig.cleanupInterval)
}

let cleanupTimer: NodeJS.Timeout | null = null

app.whenReady().then(() => {
  cleanupLogs()
  cleanupTimer = scheduleCleanup()
})

app.on('will-quit', () => {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
  }
})

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

export const silenceConsoleTransport = (): boolean => {
  if (consoleTransport.silent) return false
  consoleTransport.silent = true
  return true
}

export const getLogsDirectory = (): string => {
  return logsDir
}

export default logger

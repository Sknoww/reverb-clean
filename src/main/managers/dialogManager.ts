import { app, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import logger from '../logger'
import { loadConfig } from './configManager'

// Select folder dialog
export const selectFolder = async (title = 'Select Save Location', defaultPath?: string) => {
  logger.info('Opening folder selection dialog')
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title,
    ...(defaultPath ? { defaultPath } : {})
  })

  if (!canceled && filePaths.length > 0) {
    return filePaths[0]
  }
  return null
}

/** Absolute-path file picker for the sync screen's source/target YAMLs. */
export const selectYamlFile = async (title = 'Select YAML File', defaultPath?: string) => {
  logger.info('Opening YAML selection dialog')
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    title,
    ...(defaultPath ? { defaultPath } : {}),
    filters: [
      { name: 'YAML', extensions: ['yaml', 'yml'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (!canceled && filePaths.length > 0) {
    return filePaths[0]
  }
  return null
}

/** Absolute path to an `adb` binary, for Settings' ADB override (18b). */
export const selectExecutable = async (title = 'Select adb', defaultPath?: string) => {
  logger.info('Opening executable selection dialog')
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    title,
    ...(defaultPath ? { defaultPath } : {}),
    ...(process.platform === 'win32'
      ? {
          filters: [
            { name: 'Executable', extensions: ['exe'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        }
      : {})
  })

  return !canceled && filePaths.length > 0 ? filePaths[0] : null
}

/** Where to write an export bundle (area 17). */
export const selectBundleSavePath = async (defaultFileName: string) => {
  logger.info('Opening bundle save dialog')
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Reverb Backup',
    defaultPath: path.join(app.getPath('documents'), defaultFileName),
    filters: [
      { name: 'Reverb Backup', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  return !canceled && filePath ? filePath : null
}

/** Absolute path to an export bundle to import (area 17). */
export const selectBundleFile = async () => {
  logger.info('Opening bundle selection dialog')
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Import Reverb Backup',
    defaultPath: app.getPath('documents'),
    filters: [
      { name: 'Reverb Backup', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  return !canceled && filePaths.length > 0 ? filePaths[0] : null
}

/** Project picker for `projectSelect`. */
export const selectFile = async () => {
  logger.info('Opening file selection dialog')
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Select File',
    defaultPath: loadConfig().saveLocation
  })

  if (!canceled && filePaths.length > 0) {
    return path.basename(filePaths[0])
  }
  return null
}

export const openInEditor = async (filePath: string) => {
  try {
    logger.info('Opening file:', filePath)
    await shell.openPath(filePath)
    return { success: true }
  } catch (error: any) {
    logger.error('Error opening file:', error)
    return { success: false, error: error.message }
  }
}

/** Sync's per-row reveal action (spec D14). */
export const revealItem = async (filePath: string) => {
  logger.info('Revealing file:', filePath)
  shell.showItemInFolder(filePath)
}

export const openTempInEditor = async (
  content: string,
  extension: string
): Promise<{ success: boolean; filePath?: string; error?: string }> => {
  try {
    const tempDir = app.getPath('temp')
    const fileName = `reverb-result-${Date.now()}${extension}`
    const filePath = path.join(tempDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    logger.info('Opening temp file in editor:', filePath)
    await shell.openPath(filePath)
    return { success: true, filePath }
  } catch (error: any) {
    logger.error('Error opening temp file in editor:', error)
    return { success: false, error: error.message }
  }
}

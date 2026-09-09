import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, nativeTheme, shell } from 'electron'
import { join } from 'path'
import logo from '../../resources/icon.png?asset'
import { ProvisionProgress } from './types'

import { installCrashHandler } from './crashHandler'
import logger, { applyLoggingConfig, getLogsDirectory } from './logger'
import {
  executeAdbApplicationReset,
  executeAdbClearStorage,
  executeAdbCommand,
  getAdbVersion,
  getConnectedDevices
} from './managers/adbManager'
import { executeJsScript } from './managers/jsManager'
import { sweepStaleMacCaptureDirectories } from './managers/macScreenshotCapture'
import { runProvision } from './managers/provisionManager'
import {
  cancelRegionSelection,
  claimRegionSelection,
  completeRegionSelection,
  initializeRegionSelector,
  releaseRegionSelection,
  selectScreenBarcodeRegion
} from './managers/regionBarcodeScanner'
import { scanScreenBarcodes } from './managers/screenBarcodeScanner'
import {
  getScreenPermissionStatus,
  observeScreenPermissionScan,
  relaunchForScreenPermission,
  repairScreenPermission
} from './managers/screenPermissionManager'
import { exportBundle, importBundle } from './managers/backupManager'
import {
  forgetProject,
  getConfigFilePath,
  listConfigSnapshots,
  loadConfig,
  restoreConfigSnapshot,
  saveConfig,
  updateAdbPath,
  updateBehaviorConfig,
  updateCommonCommands,
  updateConnectorRoot,
  updateDockCollapsed,
  updateLoggingConfig,
  updateMaxSnapshots,
  updateProvisionConfig,
  updateRecentProjectId,
  updateRecentProjectIds,
  updateSyncConfig,
  updateTargetConfig
} from './managers/configManager'
import {
  openInEditor,
  openTempInEditor,
  revealItem,
  selectExecutable,
  selectFile,
  selectFolder,
  selectYamlFile
} from './managers/dialogManager'
import { applySync, getSyncBranch, planSync, scanSync } from './managers/syncManager'
import {
  deleteProject,
  duplicateProject,
  getAllProjects,
  getProject,
  saveProject
} from './managers/projectManager'

installCrashHandler()

nativeTheme.themeSource = 'dark'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minHeight: 600,
    minWidth: 1000,
    show: false,
    autoHideMenuBar: true,

    acceptFirstMouse: true,
    ...(process.platform === 'linux' ? { logo } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      enableWebSQL: false,
      webSecurity: true,
      webgl: false,
      contextIsolation: true
    },
    backgroundColor: '#535657',
    icon: join(__dirname, '../../resources/icon.png')
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [existingWindow] = BrowserWindow.getAllWindows()
    if (!existingWindow) return
    if (existingWindow.isMinimized()) existingWindow.restore()
    existingWindow.show()
    existingWindow.focus()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.electron')

    applyLoggingConfig(loadConfig().logging)
    if (process.platform === 'darwin') {
      void sweepStaleMacCaptureDirectories()
      void getScreenPermissionStatus().catch((error) => {
        logger.warn('Could not initialize screen permission recovery', {
          error: error instanceof Error ? error.message : String(error)
        })
      })
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    ipcMain.on('ping', () => logger.debug('pong'))

    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    setupIPC()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const progressSender =
  (event: IpcMainInvokeEvent) =>
  (progress: ProvisionProgress): void => {
    if (!event.sender.isDestroyed()) event.sender.send('provision:progress', progress)
  }

function setupIPC() {
  ipcMain.handle('dialog:selectFolder', (_, title, defaultPath) => selectFolder(title, defaultPath))
  ipcMain.handle('dialog:selectFile', () => selectFile())
  ipcMain.handle('dialog:selectYamlFile', (_, title, defaultPath) =>
    selectYamlFile(title, defaultPath)
  )
  ipcMain.handle('dialog:selectExecutable', (_, title, defaultPath) =>
    selectExecutable(title, defaultPath)
  )
  ipcMain.handle('dialog:openInEditor', (_, filePath) => openInEditor(filePath))
  ipcMain.handle('dialog:revealItem', (_, filePath) => revealItem(filePath))
  ipcMain.handle('dialog:openTempInEditor', (_, content, extension) =>
    openTempInEditor(content, extension)
  )

  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:save', (_, config) => saveConfig(config))
  ipcMain.handle('config:getFilePath', () => getConfigFilePath())
  ipcMain.handle('config:recentProjectId', (_, projectId) => updateRecentProjectId(projectId))
  ipcMain.handle('config:recentProjectIds', (_, previousProjectId, newProjectId) =>
    updateRecentProjectIds(previousProjectId, newProjectId)
  )
  ipcMain.handle('config:commonCommands', (_, commands) => updateCommonCommands(commands))
  ipcMain.handle('config:dockCollapsed', (_, collapsed) => updateDockCollapsed(collapsed))
  ipcMain.handle('config:connectorRoot', (_, connectorRoot) => updateConnectorRoot(connectorRoot))
  ipcMain.handle('config:sync', (_, sync) => updateSyncConfig(sync))

  ipcMain.handle('config:behavior', (_, behavior) => updateBehaviorConfig(behavior))
  ipcMain.handle('config:logging', (_, logging) => updateLoggingConfig(logging))
  ipcMain.handle('config:adbPath', (_, adbPath) => updateAdbPath(adbPath))
  ipcMain.handle('config:maxSnapshots', (_, max) => updateMaxSnapshots(max))

  ipcMain.handle('config:target', (_, target) => updateTargetConfig(target))

  ipcMain.handle('config:provision', (_, provision) => updateProvisionConfig(provision))

  ipcMain.handle('config:listSnapshots', () => listConfigSnapshots())
  ipcMain.handle('config:restoreSnapshot', (_, fileName) => restoreConfigSnapshot(fileName))
  ipcMain.handle('config:exportBundle', () => exportBundle())
  ipcMain.handle('config:importBundle', () => importBundle())

  ipcMain.handle('sync:scan', () => scanSync())
  ipcMain.handle('sync:plan', (_, zones) => planSync(zones))
  ipcMain.handle('sync:apply', (_, zones) => applySync(zones))
  ipcMain.handle('sync:branch', () => getSyncBranch())

  ipcMain.handle('project:save', (_, project) => saveProject(project))
  ipcMain.handle('project:get', (_, projectId) => getProject(projectId))
  ipcMain.handle('project:getAll', () => getAllProjects())
  // Trashing the file and pruning the recents are one operation: a surviving entry would
  // resurrect the project if a later one reused its name.
  ipcMain.handle('project:delete', async (_, filename: string) => {
    const deleted = await deleteProject(filename)
    if (!deleted) return null
    return await forgetProject(filename)
  })
  ipcMain.handle('project:duplicate', (_, sourceFilename, newName, newDescription) =>
    duplicateProject(sourceFilename, newName, newDescription)
  )

  ipcMain.handle('logger:getLogsDirectory', () => getLogsDirectory())

  ipcMain.handle('barcode:scanScreens', async (event, requestId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { status: 'capture-failed' as const }

    const result = await scanScreenBarcodes(window, (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('barcode:progress', { requestId, progress })
      }
    })
    if (result.status !== 'busy') {
      await observeScreenPermissionScan()
    }
    return result
  })

  ipcMain.handle('barcode:selectRegion', async (event, requestId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { status: 'capture-failed' as const }

    const result = await selectScreenBarcodeRegion(
      window,
      {
        preloadPath: join(__dirname, '../preload/index.js'),
        rendererFile: join(__dirname, '../renderer/index.html'),
        rendererUrl: is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
      },
      (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('barcode:progress', { requestId, progress })
        }
      }
    )
    if (result.status !== 'busy') {
      await observeScreenPermissionScan()
    }
    return result
  })

  ipcMain.handle('barcode:regionInitialize', (event) => initializeRegionSelector(event.sender.id))
  ipcMain.handle('barcode:regionClaim', (event) => claimRegionSelection(event.sender.id))
  ipcMain.on('barcode:regionRelease', (event) => releaseRegionSelection(event.sender.id))
  ipcMain.on('barcode:regionComplete', (event, selection) =>
    completeRegionSelection(event.sender.id, selection)
  )
  ipcMain.on('barcode:regionCancel', (event) => cancelRegionSelection(event.sender.id))

  ipcMain.handle('screenPermission:status', () => getScreenPermissionStatus())
  ipcMain.handle('screenPermission:repair', () => repairScreenPermission())
  ipcMain.handle('screenPermission:openSettings', async () => {
    if (process.platform !== 'darwin') return
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  })
  ipcMain.handle('screenPermission:relaunch', () => relaunchForScreenPermission())

  ipcMain.handle('adb:getDevices', async () => {
    try {
      return await getConnectedDevices()
    } catch (error) {
      logger.error('Error getting devices', { error })
      return []
    }
  })

  ipcMain.handle('adb:execute', async (_, type, value) => {
    try {
      return await executeAdbCommand(type, value)
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('adb:version', async () => {
    try {
      return await getAdbVersion()
    } catch (error) {
      logger.error('Error getting adb version', { error })
      return null
    }
  })

  ipcMain.handle('adb:applicationReset', async () => {
    try {
      return await executeAdbApplicationReset()
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('adb:clearStorage', async (event) => {
    try {
      return await executeAdbClearStorage(progressSender(event))
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('provision:run', async (event) => {
    try {
      return await runProvision({ onProgress: progressSender(event) })
    } catch (error) {
      return { success: false, steps: [], error: (error as Error).message }
    }
  })

  ipcMain.handle('js:execute', async (_, script: string) => {
    try {
      const config = loadConfig()
      const deviceId = config.currentDeviceId
      if (!deviceId) {
        return {
          success: false,
          error: 'deviceNotFound' as const,
          message: 'No device selected. Please select a device first.'
        }
      }
      return await executeJsScript(script, deviceId)
    } catch (error) {
      return { success: false, error: 'adbFailure' as const, message: (error as Error).message }
    }
  })

  logger.info('All IPC handlers registered')
}

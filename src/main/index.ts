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
import { exportBundle, importBundle } from './managers/backupManager'
import {
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

// First statement in main, so everything below is covered (F4).
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
    // Let a click on an unfocused window reach the control it landed on instead of being spent focusing the window (22).
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

// One copy at a time (22).
if (!app.requestSingleInstanceLock()) {
  // Hand off to the copy that already holds the lock, and leave before this one
  // reads config or opens a window.
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone launched us again — surface the window we already have.
    const [existingWindow] = BrowserWindow.getAllWindows()
    if (!existingWindow) return
    if (existingWindow.isMinimized()) existingWindow.restore()
    existingWindow.show()
    existingWindow.focus()
  })

  app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Bring the logger onto the configured level/retention before anything else logs (18b).
    applyLoggingConfig(loadConfig().logging)

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // IPC test
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

/** `provision:progress` — the app's first main → renderer push (28b2). */
const progressSender =
  (event: IpcMainInvokeEvent) =>
  (progress: ProvisionProgress): void => {
    if (!event.sender.isDestroyed()) event.sender.send('provision:progress', progress)
  }

// Set up IPC handlers
// Replace your setupIPC function with this updated version
function setupIPC() {
  // File handlers
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

  // Config handlers
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

  // Settings' Behavior / Logging / Paths sections (18b)
  ipcMain.handle('config:behavior', (_, behavior) => updateBehaviorConfig(behavior))
  ipcMain.handle('config:logging', (_, logging) => updateLoggingConfig(logging))
  ipcMain.handle('config:adbPath', (_, adbPath) => updateAdbPath(adbPath))
  ipcMain.handle('config:maxSnapshots', (_, max) => updateMaxSnapshots(max))

  // Settings' Target section (area 19)
  ipcMain.handle('config:target', (_, target) => updateTargetConfig(target))

  // Settings' Provisioning section (area 28)
  ipcMain.handle('config:provision', (_, provision) => updateProvisionConfig(provision))

  // Config backup handlers (area 17), surfaced by Settings' Data section (18a).
  ipcMain.handle('config:listSnapshots', () => listConfigSnapshots())
  ipcMain.handle('config:restoreSnapshot', (_, fileName) => restoreConfigSnapshot(fileName))
  ipcMain.handle('config:exportBundle', () => exportBundle())
  ipcMain.handle('config:importBundle', () => importBundle())

  // Workflow sync handlers
  ipcMain.handle('sync:scan', () => scanSync())
  ipcMain.handle('sync:plan', (_, zones) => planSync(zones))
  ipcMain.handle('sync:apply', (_, zones) => applySync(zones))
  ipcMain.handle('sync:branch', () => getSyncBranch())

  // Project handlers
  ipcMain.handle('project:save', (_, project) => saveProject(project))
  ipcMain.handle('project:get', (_, projectId) => getProject(projectId))
  ipcMain.handle('project:getAll', () => getAllProjects())
  ipcMain.handle('project:delete', (_, projectId) => deleteProject(projectId))
  ipcMain.handle('project:duplicate', (_, sourceFilename, newName, newDescription) =>
    duplicateProject(sourceFilename, newName, newDescription)
  )

  // Logger handlers
  ipcMain.handle('logger:getLogsDirectory', () => getLogsDirectory())

  // Quick-scan screenshots never cross into the renderer.
  ipcMain.handle('barcode:scanScreens', async (event, requestId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { status: 'capture-failed' as const }

    return scanScreenBarcodes(window, (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('barcode:progress', { requestId, progress })
      }
    })
  })

  ipcMain.handle('barcode:selectRegion', async (event, requestId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { status: 'capture-failed' as const }

    return selectScreenBarcodeRegion(
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
  })

  ipcMain.handle('barcode:regionInitialize', (event) => initializeRegionSelector(event.sender.id))
  ipcMain.handle('barcode:regionClaim', (event) => claimRegionSelection(event.sender.id))
  ipcMain.on('barcode:regionRelease', (event) => releaseRegionSelection(event.sender.id))
  ipcMain.on('barcode:regionComplete', (event, selection) =>
    completeRegionSelection(event.sender.id, selection)
  )
  ipcMain.on('barcode:regionCancel', (event) => cancelRegionSelection(event.sender.id))

  ipcMain.handle('barcode:openScreenRecordingSettings', async () => {
    if (process.platform !== 'darwin') return
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  })

  // ADB handlers - UPDATED to include device selection
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

  /** The provisioning routine on its own (area 28). */
  ipcMain.handle('provision:run', async (event) => {
    try {
      return await runProvision({ onProgress: progressSender(event) })
    } catch (error) {
      return { success: false, steps: [], error: (error as Error).message }
    }
  })

  // JS execution handlers
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

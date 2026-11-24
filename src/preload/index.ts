import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  ProvisionProgress,
  RegionSelection,
  ScreenScanProgress,
  ScrcpyPacket,
  ScrcpyState,
  WorkflowState
} from './types'

contextBridge.exposeInMainWorld('projectAPI', {
  saveProject: (project) => ipcRenderer.invoke('project:save', project),
  getProject: (projectId) => ipcRenderer.invoke('project:get', projectId),
  getAllProjects: () => ipcRenderer.invoke('project:getAll'),
  deleteProject: (filename) => ipcRenderer.invoke('project:delete', filename),
  duplicateProject: (sourceFilename, newName, newDescription) =>
    ipcRenderer.invoke('project:duplicate', sourceFilename, newName, newDescription)
})

let scrcpyListeners = 0

const trackScrcpySubscription = (): (() => void) => {
  if (scrcpyListeners++ === 0) void ipcRenderer.invoke('scrcpy:subscribe')
  let released = false
  return () => {
    if (released) return
    released = true
    if (--scrcpyListeners === 0) void ipcRenderer.invoke('scrcpy:unsubscribe')
  }
}

contextBridge.exposeInMainWorld('adbAPI', {
  getDevices: () => ipcRenderer.invoke('adb:getDevices'),
  getVersion: () => ipcRenderer.invoke('adb:version'),

  executeCommand: (type, value) => ipcRenderer.invoke('adb:execute', type, value),
  executeApplicationReset: () => ipcRenderer.invoke('adb:applicationReset'),

  clearStorage: () => ipcRenderer.invoke('adb:clearStorage'),

  scrcpyState: () => ipcRenderer.invoke('scrcpy:state'),
  startScrcpy: (deviceId: string) => ipcRenderer.invoke('scrcpy:start', deviceId),
  stopScrcpy: () => ipcRenderer.invoke('scrcpy:stop'),
  onScrcpyState: (callback: (state: ScrcpyState) => void) => {
    const listener = (_event: IpcRendererEvent, state: ScrcpyState): void => callback(state)
    ipcRenderer.on('scrcpy:state', listener)
    const release = trackScrcpySubscription()
    return () => {
      ipcRenderer.removeListener('scrcpy:state', listener)
      release()
    }
  },

  sendScrcpyTouch: (action: string, x: number, y: number, width: number, height: number) =>
    ipcRenderer.send('scrcpy:touch', action, x, y, width, height),
  sendScrcpyScroll: (x: number, y: number, dx: number, dy: number, width: number, height: number) =>
    ipcRenderer.send('scrcpy:scroll', x, y, dx, dy, width, height),
  sendScrcpyKey: (action: string, code: string, meta: number) =>
    ipcRenderer.send('scrcpy:key', action, code, meta),
  sendScrcpyNav: (button: string) => ipcRenderer.send('scrcpy:nav', button),
  requestScrcpyKeyframe: () => ipcRenderer.invoke('scrcpy:keyframe'),
  onScrcpyPacket: (callback: (packet: ScrcpyPacket) => void) => {
    const listener = (_event: IpcRendererEvent, packet: ScrcpyPacket): void => callback(packet)
    ipcRenderer.on('scrcpy:packet', listener)
    const release = trackScrcpySubscription()
    return () => {
      ipcRenderer.removeListener('scrcpy:packet', listener)
      release()
    }
  },

  watchWorkflow: (deviceId: string, packageId: string) =>
    ipcRenderer.invoke('adb:watchWorkflow', deviceId, packageId),
  onWorkflowState: (callback: (state: WorkflowState) => void) => {
    const listener = (_event: IpcRendererEvent, state: WorkflowState): void => callback(state)
    ipcRenderer.on('adb:workflowState', listener)
    return () => ipcRenderer.removeListener('adb:workflowState', listener)
  }
})

const invokeBarcodeScan = (
  channel: 'barcode:scanScreens' | 'barcode:selectRegion',
  onProgress?: (progress: ScreenScanProgress) => void
) => {
  const requestId = randomUUID()
  const listener = (
    _event: IpcRendererEvent,
    update: { requestId: string; progress: ScreenScanProgress }
  ): void => {
    if (update.requestId === requestId) onProgress?.(update.progress)
  }
  ipcRenderer.on('barcode:progress', listener)
  return ipcRenderer
    .invoke(channel, requestId)
    .finally(() => ipcRenderer.removeListener('barcode:progress', listener))
}

contextBridge.exposeInMainWorld('barcodeAPI', {
  scanScreens: (onProgress?: (progress: ScreenScanProgress) => void) =>
    invokeBarcodeScan('barcode:scanScreens', onProgress),
  selectRegion: (onProgress?: (progress: ScreenScanProgress) => void) =>
    invokeBarcodeScan('barcode:selectRegion', onProgress)
})

contextBridge.exposeInMainWorld('screenPermissionAPI', {
  getStatus: () => ipcRenderer.invoke('screenPermission:status'),
  repair: () => ipcRenderer.invoke('screenPermission:repair'),
  openSettings: () => ipcRenderer.invoke('screenPermission:openSettings'),
  relaunch: () => ipcRenderer.invoke('screenPermission:relaunch')
})

contextBridge.exposeInMainWorld('regionSelectorAPI', {
  initialize: () => ipcRenderer.invoke('barcode:regionInitialize'),
  claim: () => ipcRenderer.invoke('barcode:regionClaim'),
  release: () => ipcRenderer.send('barcode:regionRelease'),
  complete: (selection: RegionSelection) => ipcRenderer.send('barcode:regionComplete', selection),
  cancel: () => ipcRenderer.send('barcode:regionCancel'),
  onOwnerChanged: (callback: (ownership: { owned: boolean; blocked: boolean }) => void) => {
    const listener = (
      _event: IpcRendererEvent,
      ownership: { owned: boolean; blocked: boolean }
    ): void => callback(ownership)
    ipcRenderer.on('barcode:regionOwner', listener)
    return () => ipcRenderer.removeListener('barcode:regionOwner', listener)
  }
})

contextBridge.exposeInMainWorld('provisionAPI', {
  run: () => ipcRenderer.invoke('provision:run'),

  onProgress: (callback: (progress: ProvisionProgress) => void) => {
    const listener = (_event: IpcRendererEvent, progress: ProvisionProgress): void =>
      callback(progress)
    ipcRenderer.on('provision:progress', listener)
    return () => ipcRenderer.removeListener('provision:progress', listener)
  }
})

contextBridge.exposeInMainWorld('configAPI', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  getConfigFilePath: () => ipcRenderer.invoke('config:getFilePath'),
  selectSaveLocation: () => ipcRenderer.invoke('dialog:selectFolder'),
  updateRecentProjectId: (projectId) => ipcRenderer.invoke('config:recentProjectId', projectId),
  updateRecentProjectIds: (previousProjectId, newProjectId) =>
    ipcRenderer.invoke('config:recentProjectIds', previousProjectId, newProjectId),
  updateCommonCommands: (commands) => ipcRenderer.invoke('config:commonCommands', commands),

  updateDockCollapsed: (collapsed) => ipcRenderer.invoke('config:dockCollapsed', collapsed),
  updateConnectorRoot: (connectorRoot) => ipcRenderer.invoke('config:connectorRoot', connectorRoot),
  updateSyncConfig: (sync) => ipcRenderer.invoke('config:sync', sync),

  updateBehaviorConfig: (behavior) => ipcRenderer.invoke('config:behavior', behavior),
  updateLoggingConfig: (logging) => ipcRenderer.invoke('config:logging', logging),
  updateAdbPath: (adbPath) => ipcRenderer.invoke('config:adbPath', adbPath),

  updateTargetConfig: (target) => ipcRenderer.invoke('config:target', target),

  updateProvisionConfig: (provision) => ipcRenderer.invoke('config:provision', provision),
  updateMaxSnapshots: (max) => ipcRenderer.invoke('config:maxSnapshots', max),
  listConfigSnapshots: () => ipcRenderer.invoke('config:listSnapshots'),
  restoreConfigSnapshot: (fileName) => ipcRenderer.invoke('config:restoreSnapshot', fileName),
  exportBundle: () => ipcRenderer.invoke('config:exportBundle'),
  importBundle: () => ipcRenderer.invoke('config:importBundle')
})

contextBridge.exposeInMainWorld('dialogAPI', {
  selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
  selectFolder: (title?: string, defaultPath?: string) =>
    ipcRenderer.invoke('dialog:selectFolder', title, defaultPath),
  selectYamlFile: (title?: string, defaultPath?: string) =>
    ipcRenderer.invoke('dialog:selectYamlFile', title, defaultPath),
  selectExecutable: (title?: string, defaultPath?: string) =>
    ipcRenderer.invoke('dialog:selectExecutable', title, defaultPath),
  openInEditor: (filePath) => ipcRenderer.invoke('dialog:openInEditor', filePath),
  revealItem: (filePath: string) => ipcRenderer.invoke('dialog:revealItem', filePath),
  openTempInEditor: (content: string, extension: string) =>
    ipcRenderer.invoke('dialog:openTempInEditor', content, extension)
})

contextBridge.exposeInMainWorld('syncAPI', {
  scan: () => ipcRenderer.invoke('sync:scan'),
  plan: (zones: string[]) => ipcRenderer.invoke('sync:plan', zones),
  apply: (zones: string[]) => ipcRenderer.invoke('sync:apply', zones),
  getBranch: () => ipcRenderer.invoke('sync:branch')
})

contextBridge.exposeInMainWorld('loggerAPI', {
  getLogsDirectory: () => ipcRenderer.invoke('logger:getLogsDirectory')
})

contextBridge.exposeInMainWorld('jsAPI', {
  executeScript: (script: string) => ipcRenderer.invoke('js:execute', script)
})

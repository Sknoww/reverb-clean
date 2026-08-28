import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { ProvisionProgress } from './types'

// Expose project management API to renderer
contextBridge.exposeInMainWorld('projectAPI', {
  saveProject: (project) => ipcRenderer.invoke('project:save', project),
  getProject: (projectId) => ipcRenderer.invoke('project:get', projectId),
  getAllProjects: () => ipcRenderer.invoke('project:getAll'),
  deleteProject: (projectId) => ipcRenderer.invoke('project:delete', projectId),
  duplicateProject: (sourceFilename, newName, newDescription) =>
    ipcRenderer.invoke('project:duplicate', sourceFilename, newName, newDescription)
})

// Expose ADB API - UPDATED with device selection
contextBridge.exposeInMainWorld('adbAPI', {
  getDevices: () => ipcRenderer.invoke('adb:getDevices'),
  getVersion: () => ipcRenderer.invoke('adb:version'),
  // Takes the command's *type* (area 19), not a finished intent action: main resolves it against `config.target`, so the renderer never...
  executeCommand: (type, value) => ipcRenderer.invoke('adb:execute', type, value),
  executeApplicationReset: () => ipcRenderer.invoke('adb:applicationReset'),
  // Area 25.
  clearStorage: () => ipcRenderer.invoke('adb:clearStorage')
})

contextBridge.exposeInMainWorld('provisionAPI', {
  // The steps on their own — no force-stop, no relaunch (area 28).
  run: () => ipcRenderer.invoke('provision:run'),
  /** The app's only main → renderer subscription (28b2). */
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
  // Removed in 18a: four `notify*Changed` sends — saveLocation, recentProjectId, recentProjectIds, commonCommands.
  updateDockCollapsed: (collapsed) => ipcRenderer.invoke('config:dockCollapsed', collapsed),
  updateConnectorRoot: (connectorRoot) => ipcRenderer.invoke('config:connectorRoot', connectorRoot),
  updateSyncConfig: (sync) => ipcRenderer.invoke('config:sync', sync),
  // 18b — each merges a partial into its block, main-side (see configManager).
  updateBehaviorConfig: (behavior) => ipcRenderer.invoke('config:behavior', behavior),
  updateLoggingConfig: (logging) => ipcRenderer.invoke('config:logging', logging),
  updateAdbPath: (adbPath) => ipcRenderer.invoke('config:adbPath', adbPath),
  // 19 — Settings' Target section, same partial-merge shape as the blocks above.
  updateTargetConfig: (target) => ipcRenderer.invoke('config:target', target),
  // 28 — Settings' Provisioning section. `steps` is sent whole when it's sent.
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

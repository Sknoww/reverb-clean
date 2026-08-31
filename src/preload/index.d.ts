import { Config } from '@/types'
import {
  BehaviorConfig,
  BundleResult,
  ClearStorageResult,
  ConfigSnapshot,
  JsExecutionResult,
  LoggingConfig,
  Project,
  ProvisionConfig,
  ProvisionProgress,
  ProvisionResult,
  RegionSelection,
  RegionSelectorInit,
  ScreenBarcodeScanResult,
  ScreenPermissionStatus,
  ScreenScanProgress,
  SyncApplyResult,
  SyncConfig,
  SyncPlanResult,
  SyncScanResult,
  TargetConfig
} from './types'

declare global {
  interface Window {
    projectAPI: {
      saveProject: (project: Project) => Promise<void>
      getProject: (projectId: string) => Promise<Project | null>
      getAllProjects: () => Promise<Project[]>
      deleteProject: (projectId: string) => Promise<boolean>
      duplicateProject: (
        sourceFilename: string,
        newName: string,
        newDescription: string
      ) => Promise<Project | null>
    }
    adbAPI: {
      getDevices: () => Promise<AdbDevice[]>

      getVersion: () => Promise<string | null>

      executeCommand: (type: string, value: string) => Promise<AdbCommandResult>
      executeApplicationReset: () => Promise<AdbCommandResult>

      clearStorage: () => Promise<ClearStorageResult>
    }
    barcodeAPI: {
      scanScreens: (
        onProgress?: (progress: ScreenScanProgress) => void
      ) => Promise<ScreenBarcodeScanResult>
      selectRegion: (
        onProgress?: (progress: ScreenScanProgress) => void
      ) => Promise<ScreenBarcodeScanResult>
    }
    screenPermissionAPI: {
      getStatus: () => Promise<ScreenPermissionStatus>
      repair: () => Promise<{ success: boolean; error?: string }>
      openSettings: () => Promise<void>
      relaunch: () => Promise<void>
    }
    regionSelectorAPI: {
      initialize: () => Promise<RegionSelectorInit | null>
      claim: () => Promise<boolean>
      release: () => void
      complete: (selection: RegionSelection) => void
      cancel: () => void
      onOwnerChanged: (
        callback: (ownership: { owned: boolean; blocked: boolean }) => void
      ) => () => void
    }
    provisionAPI: {
      run: () => Promise<ProvisionResult>

      onProgress: (callback: (progress: ProvisionProgress) => void) => () => void
    }
    configAPI: {
      getConfig: () => Promise<Config>
      saveConfig: (config: Partial<Config>) => Promise<boolean>
      getConfigFilePath: () => Promise<string | null>
      selectSaveLocation: () => Promise<string | null>
      updateRecentProjectId: (projectId: string) => void
      updateRecentProjectIds: (previousProjectId: string, newProjectId: string) => void
      updateCommonCommands: (commands: AdbCommand[]) => void
      updateDockCollapsed: (collapsed: boolean) => Promise<boolean>
      updateConnectorRoot: (connectorRoot: string) => Promise<void>
      updateSyncConfig: (sync: Partial<SyncConfig>) => Promise<void>

      updateBehaviorConfig: (behavior: Partial<BehaviorConfig>) => Promise<void>
      updateLoggingConfig: (logging: Partial<LoggingConfig>) => Promise<void>
      updateAdbPath: (adbPath: string) => Promise<void>
      updateMaxSnapshots: (max: number) => Promise<void>

      updateTargetConfig: (target: Partial<TargetConfig>) => Promise<void>

      updateProvisionConfig: (provision: Partial<ProvisionConfig>) => Promise<void>

      listConfigSnapshots: () => Promise<ConfigSnapshot[]>
      restoreConfigSnapshot: (fileName: string) => Promise<boolean>

      exportBundle: () => Promise<BundleResult>
      importBundle: () => Promise<BundleResult>
    }
    dialogAPI: {
      selectFile: () => Promise<string | null>
      selectFolder: (title?: string, defaultPath?: string) => Promise<string | null>

      selectYamlFile: (title?: string, defaultPath?: string) => Promise<string | null>

      selectExecutable: (title?: string, defaultPath?: string) => Promise<string | null>
      openInEditor: (filePath: string) => Promise<string | null>

      revealItem: (filePath: string) => Promise<void>
      openTempInEditor: (
        content: string,
        extension: string
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>
    }
    syncAPI: {
      scan: () => Promise<SyncScanResult>

      plan: (zones: string[]) => Promise<SyncPlanResult>
      apply: (zones: string[]) => Promise<SyncApplyResult>
      getBranch: () => Promise<string | null>
    }
    loggerAPI: {
      getLogsDirectory: () => string
    }
    jsAPI: {
      executeScript: (script: string) => Promise<JsExecutionResult>
    }
  }
}

export {}

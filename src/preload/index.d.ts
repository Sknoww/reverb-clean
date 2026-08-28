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
      // Bundled-adb release for the status bar; null when adb can't be read.
      getVersion: () => Promise<string | null>
      /** `type` is the command's own type — main maps it to a configured intent action (19). */
      executeCommand: (type: string, value: string) => Promise<AdbCommandResult>
      executeApplicationReset: () => Promise<AdbCommandResult>
      /** `pm clear` against the configured package, the provisioning routine, then a relaunch (areas 25 and 28). */
      clearStorage: () => Promise<ClearStorageResult>
    }
    provisionAPI: {
      /** The steps alone — no force-stop, no relaunch (area 28). */
      run: () => Promise<ProvisionResult>
      /** Fires before each step, for a standalone run *and* for the routine inside `clearStorage` (28b2). */
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
      /** Settings' Behavior / Logging / Paths sections (18b). */
      updateBehaviorConfig: (behavior: Partial<BehaviorConfig>) => Promise<void>
      updateLoggingConfig: (logging: Partial<LoggingConfig>) => Promise<void>
      updateAdbPath: (adbPath: string) => Promise<void>
      updateMaxSnapshots: (max: number) => Promise<void>
      /** Settings' Target section (area 19). */
      updateTargetConfig: (target: Partial<TargetConfig>) => Promise<void>
      /** Settings' Provisioning section (area 28) — `steps` replaces wholesale. */
      updateProvisionConfig: (provision: Partial<ProvisionConfig>) => Promise<void>
      /** Config backup (area 17), surfaced by Settings' Data section (18a). */
      listConfigSnapshots: () => Promise<ConfigSnapshot[]>
      restoreConfigSnapshot: (fileName: string) => Promise<boolean>
      /** Both open a file dialog; `filePath: null` means the user cancelled. */
      exportBundle: () => Promise<BundleResult>
      importBundle: () => Promise<BundleResult>
    }
    dialogAPI: {
      /** Returns the basename only — use `selectYamlFile` when you need a path. */
      selectFile: () => Promise<string | null>
      selectFolder: (title?: string, defaultPath?: string) => Promise<string | null>
      /** Absolute path to a picked `.yaml`/`.yml`, or null when cancelled. */
      selectYamlFile: (title?: string, defaultPath?: string) => Promise<string | null>
      /** Absolute path to a picked binary — Settings' ADB override (18b). */
      selectExecutable: (title?: string, defaultPath?: string) => Promise<string | null>
      openInEditor: (filePath: string) => Promise<string | null>
      /** Selects the file in Finder / Explorer rather than opening it (sync D14). */
      revealItem: (filePath: string) => Promise<void>
      openTempInEditor: (
        content: string,
        extension: string
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>
    }
    syncAPI: {
      /** Re-reads both YAMLs every call — source changes on every branch switch. */
      scan: () => Promise<SyncScanResult>
      /** `zones` is the set that should be in the target after applying. */
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

export interface AdbCommand {
  id: string
  name: string
  keyword: string
  type: string
  value: string
  description?: string
  // Dock-only: pins the command to the top block. Never set on a project or flow command.
  pinned?: boolean
}

export interface AdbDevice {
  id: string
  model?: string
  status: string
}

export interface Flow {
  id: string
  name: string
  description?: string
  commands: AdbCommand[]
  delay: number
}

export interface Project {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  commands: AdbCommand[]
  flows: Flow[]
}

export interface Config {
  saveLocation: string
  currentDeviceId: string
  recentProjectId: string
  mostRecentProjectIds: string[]
  commonCommands: AdbCommand[]
  dockCollapsed?: boolean

  connectorRoot?: string
  sync?: SyncConfig

  adbPath?: string

  maxSnapshots?: number
  behavior?: BehaviorConfig
  logging?: LoggingConfig

  target?: TargetConfig

  provision?: ProvisionConfig
}

export interface ScreenPermissionStatus {
  platform: 'darwin' | 'unsupported'
  status: 'allowed' | 'not-requested' | 'needs-repair' | 'denied' | 'restricted' | 'unavailable'
  recovery: 'none' | 'awaiting-registration' | 'awaiting-approval'
  relaunchRecommended: boolean
}

export interface TargetConfig {
  packageId: string
  launcherActivity: string
  scriptProviderUri: string
  speechIntent: string
  barcodeIntent: string
}

export type QuickScanMode = 'region' | 'screens'

export interface BehaviorConfig {
  flowDelayMs: number

  adbTimeoutMs: number

  jsTimeoutMs: number

  provisionTimeoutMs: number

  quickScanMode: QuickScanMode
}

export type ProvisionStepType = 'shell' | 'push' | 'grant' | 'wait'

interface ProvisionStepBase {
  id: string

  label?: string
}

export interface ProvisionShellStep extends ProvisionStepBase {
  type: 'shell'
  command: string

  continueOnError?: boolean
}

export interface ProvisionPushStep extends ProvisionStepBase {
  type: 'push'

  source: string
  destination: string

  sync?: boolean
}

export interface ProvisionGrantStep extends ProvisionStepBase {
  type: 'grant'

  permissions: string[]
}

export interface ProvisionWaitStep extends ProvisionStepBase {
  type: 'wait'
  durationMs: number
}

export type ProvisionStep =
  | ProvisionShellStep
  | ProvisionPushStep
  | ProvisionGrantStep
  | ProvisionWaitStep

export interface ProvisionConfig {
  sourceRoot: string
  steps: ProvisionStep[]
}

export interface ProvisionPermissionResult {
  permission: string
  success: boolean
  error?: string
}

export interface ProvisionStepResult {
  id: string
  index: number
  type: ProvisionStepType
  label: string
  success: boolean

  continued?: boolean
  durationMs: number
  output?: string
  error?: string
  permissions?: ProvisionPermissionResult[]
}

export interface ProvisionResult {
  success: boolean
  steps: ProvisionStepResult[]
  failedIndex?: number

  error?: string
}

export interface ProvisionProgress {
  index: number
  total: number
  label: string
  type: ProvisionStepType
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LoggingConfig {
  level: LogLevel
  maxAgeDays: number
  maxFiles: number
}

export interface ConfigSnapshot {
  fileName: string

  savedAt: string
  size: number
}

export interface BundleResult {
  success: boolean
  filePath: string | null
  projectCount: number
  error?: string
}

export interface SyncProfile {
  id: string
  name: string
  zones: string[]
}

export interface SyncConfig {
  sourceFile: string

  targetFile: string

  deploymentPath: string
  profiles: SyncProfile[]
  activeProfileId?: string
}

export type SyncEntryStatus = 'available' | 'current' | 'outOfDate' | 'orphan'

export interface SyncEntry {
  zone: string
  status: SyncEntryStatus

  group: string | null
  inTarget: boolean

  localPath: string

  fileMissing: boolean
  sourceFileName: string | null

  sourceVersion: string | null

  sourceRevision: number | null
  targetFileName: string | null
  targetVersion: string | null
  targetRevision: number | null

  repeatable?: boolean
}

export interface SyncScanResult {
  ok: boolean
  error?: string
  entries: SyncEntry[]

  branch: string | null
  connectorRoot: string
  sourceFile: string
  targetFile: string
  deploymentPath: string
}

export interface SyncPlanItem {
  zone: string
  fromFileName: string | null
  toFileName: string | null
  localPath: string
}

export interface SyncPlan {
  adds: SyncPlanItem[]
  removes: SyncPlanItem[]
  bumps: SyncPlanItem[]
  unchanged: number
  targetFile: string

  backupKeep: number
  branch: string | null
}

export interface SyncPlanResult {
  ok: boolean
  error?: string
  plan?: SyncPlan
}

export interface SyncApplyResult {
  success: boolean
  error?: string
  plan?: SyncPlan
  backupFile?: string
}

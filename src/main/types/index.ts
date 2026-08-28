export interface AdbCommand {
  id?: string
  name: string
  keyword: string
  type: string
  value: string
  description?: string
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
  /** Connector repo checkout root. */
  connectorRoot: string
  sync?: SyncConfig

  // Area 18b.

  /** Absolute path to an `adb` binary to use instead of the bundled platform-tools. */
  adbPath: string
  /** Rotating pre-write config snapshots to keep (area 17b). */
  maxSnapshots: number
  behavior: BehaviorConfig
  logging: LoggingConfig
  target: TargetConfig
  provision: ProvisionConfig
}

/** Which Android client Reverb drives (area 19). */
export interface TargetConfig {
  /** Application id. Force-stopped and relaunched by Reset client. */
  packageId: string
  /** Fully-qualified activity Reset client starts (`am start -n <pkg>/<activity>`). */
  launcherActivity: string
  /** `content://…` URI the JS Console queries to run a script. */
  scriptProviderUri: string
  /** Broadcast action a `speech` command is sent as. */
  speechIntent: string
  /** Broadcast action a `barcode` command is sent as. */
  barcodeIntent: string
}

/** Timings that were compiled-in constants until 18b. */
export interface BehaviorConfig {
  /** Inter-command delay a new flow is created with. */
  flowDelayMs: number
  /** Wall-clock ceiling on every `adb` invocation. */
  adbTimeoutMs: number
  /** Ceiling on a JS Console execution (`jsManager`). */
  jsTimeoutMs: number
  /** Ceiling on a single provisioning step (area 28). */
  provisionTimeoutMs: number
}

// Device provisioning (area 28) The routine that runs *between* `pm clear` and the relaunch: put the artifact directory, the artifacts...

export type ProvisionStepType = 'shell' | 'push' | 'grant' | 'wait'

interface ProvisionStepBase {
  id: string
  /** What progress and the failure report call this step. */
  label?: string
}

/** A raw adb shell command line — the escape hatch, sent to the device as-is. */
export interface ProvisionShellStep extends ProvisionStepBase {
  type: 'shell'
  command: string
  /** A failed step stops the routine; this is the exception, and `mkdir` is why it exists — it fails when the directory is already there,... */
  continueOnError?: boolean
}

export interface ProvisionPushStep extends ProvisionStepBase {
  type: 'push'
  /** Host path. Relative resolves against `ProvisionConfig.sourceRoot`. */
  source: string
  /** Device destination, passed to `adb push` unchanged. */
  destination: string
  /** `adb push --sync`: skip files already on the device with the same timestamp and size. */
  sync?: boolean
}

/** One step carrying a list, not one step per permission: it reads as the single decision it is, and each permission's outcome is reported... */
export interface ProvisionGrantStep extends ProvisionStepBase {
  type: 'grant'
  permissions: string[]
}

/** Wall-clock pause. Runs no process, so `provisionTimeoutMs` doesn't apply. */
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
  /** Working directory a relative `push` source resolves against. */
  sourceRoot: string
  steps: ProvisionStep[]
}

/** One permission's outcome inside a `grant` step. */
export interface ProvisionPermissionResult {
  permission: string
  success: boolean
  error?: string
}

export interface ProvisionStepResult {
  id: string
  /** 0-based position in the routine, so a report can say "step 3 of 4". */
  index: number
  type: ProvisionStepType
  label: string
  success: boolean
  /** Failed, but `continueOnError` kept the routine going. */
  continued?: boolean
  durationMs: number
  /** Combined stdout + stderr, adb's own daemon chatter stripped. */
  output?: string
  error?: string
  permissions?: ProvisionPermissionResult[]
}

export interface ProvisionResult {
  success: boolean
  steps: ProvisionStepResult[]
  /** Index of the step that stopped the run. */
  failedIndex?: number
  /** Set when the routine refused to start (nothing ran) or a step stopped it. */
  error?: string
}

/** Emitted before each step starts, for the status bar's flow slot (28b). */
export interface ProvisionProgress {
  index: number
  total: number
  label: string
  type: ProvisionStepType
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LoggingConfig {
  level: LogLevel
  /** Delete log files older than this many days. */
  maxAgeDays: number
  /** Hard cap on log files kept, whatever their age. */
  maxFiles: number
}

// Config backup (area 17)

/** One rotating pre-write snapshot of `config.json`. */
export interface ConfigSnapshot {
  /** Basename inside the snapshots directory — also the restore handle. */
  fileName: string
  /** ISO timestamp parsed off the filename. */
  savedAt: string
  size: number
}

/** The fresh-machine restore story: `config.json` *and* every project under `saveLocation`, in one file. */
export interface ReverbBundle {
  format: 'reverb-bundle'
  version: 1
  exportedAt: string
  appVersion: string
  config: Config
  projects: BundleProject[]
}

export interface BundleProject {
  /** `{id}.project.json`, as written under `saveLocation`. */
  fileName: string
  project: Project
}

export interface BundleResult {
  success: boolean
  /** Absolute path written to / read from; null when the user cancelled. */
  filePath: string | null
  projectCount: number
  error?: string
}

/** A saved, named set of zones — scoped to what's being tested (spec D5). */
export interface SyncProfile {
  id: string
  name: string
  zones: string[]
}

export interface SyncConfig {
  /** Absolute path to the connector's source YAML (read-only). */
  sourceFile: string
  /** Absolute path to the tester's local YAML — the only file sync writes. */
  targetFile: string
  /** Dotted key path to the deployment list inside both YAMLs (19c). */
  deploymentPath: string
  profiles: SyncProfile[]
  activeProfileId?: string
}

/** Where a zone stands between source and target. */
export type SyncEntryStatus = 'available' | 'current' | 'outOfDate' | 'orphan'

export interface SyncEntry {
  zone: string
  status: SyncEntryStatus
  /** Leading directory segment of the source path — display only (spec D4). */
  group: string | null
  inTarget: boolean
  /** Composed local path (spec D3), or the target's path as written for orphans. */
  localPath: string
  /** Nothing at `localPath` on disk — the `NO FILE` badge. */
  fileMissing: boolean
  sourceFileName: string | null
  /** `YYYY-MM-DD` parsed off the filename, or null when it doesn't parse (rule 5). */
  sourceVersion: string | null
  /** Same-day revision from a trailing `_N` (`…_2026_07_09_3.ext` → `3`), or null when the name carries none. */
  sourceRevision: number | null
  targetFileName: string | null
  targetVersion: string | null
  targetRevision: number | null
  /** Source's flag, mirrored silently on write and never rendered (spec D6). */
  repeatable?: boolean
}

export interface SyncScanResult {
  ok: boolean
  error?: string
  entries: SyncEntry[]
  /** Branch under `connectorRoot`; null when it isn't a checkout (spec D13). */
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

/** The apply preview — the one destructive moment (spec D9). */
export interface SyncPlan {
  adds: SyncPlanItem[]
  removes: SyncPlanItem[]
  bumps: SyncPlanItem[]
  unchanged: number
  targetFile: string
  /** How many rotating backups apply keeps (F3) — the name isn't known until the write. */
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

export interface JsExecutionResult {
  success: boolean
  result?: unknown
  rawOutput?: string
  timedOut?: boolean
  /** `noTarget`: no script provider configured (area 19) — nothing was sent. */
  error?: 'deviceNotFound' | 'adbFailure' | 'parseError' | 'noTarget'
  message?: string
}

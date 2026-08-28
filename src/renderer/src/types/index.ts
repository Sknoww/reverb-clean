export interface AdbCommand {
  id: string
  name: string
  keyword: string
  type: string
  value: string
  description?: string
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
  /** Connector repo checkout root — the design frames' "base path". */
  connectorRoot?: string
  sync?: SyncConfig

  // Area 18b — mirrors src/main/types.

  /** Absolute path to an `adb` to use instead of the bundled one; '' = bundled. */
  adbPath?: string
  /** Rotating pre-write config snapshots to keep. */
  maxSnapshots?: number
  behavior?: BehaviorConfig
  logging?: LoggingConfig
  /** Area 19 — which client Reverb drives. Optional for the same first-frame reason. */
  target?: TargetConfig
  /** Area 28 — the routine that runs between a clear and the relaunch. */
  provision?: ProvisionConfig
}

/** The Android client Reverb drives (area 19) — mirrors src/main/types, where the field notes live. */
export interface TargetConfig {
  packageId: string
  launcherActivity: string
  scriptProviderUri: string
  speechIntent: string
  barcodeIntent: string
}

/** Timings that were compiled-in constants until 18b. */
export interface BehaviorConfig {
  /** Delay a **new** flow is seeded with — never an override on existing flows. */
  flowDelayMs: number
  /** Ceiling on every adb invocation. There was none before 18b. */
  adbTimeoutMs: number
  /** Ceiling on a JS Console execution. */
  jsTimeoutMs: number
  /** Ceiling on one provisioning step (28a) — a folder push is minutes. */
  provisionTimeoutMs: number
}

// Device provisioning (area 28) — mirrors src/main/types, where the notes live.

export type ProvisionStepType = 'shell' | 'push' | 'grant' | 'wait'

interface ProvisionStepBase {
  id: string
  /** Falls back to a description the step derives from its own fields. */
  label?: string
}

export interface ProvisionShellStep extends ProvisionStepBase {
  type: 'shell'
  command: string
  /** The `mkdir`-already-exists case — the one step type that may fail on. */
  continueOnError?: boolean
}

export interface ProvisionPushStep extends ProvisionStepBase {
  type: 'push'
  /** Relative resolves against `ProvisionConfig.sourceRoot`. */
  source: string
  destination: string
  /** `adb push --sync`. Off by default — it trusts timestamps. */
  sync?: boolean
}

export interface ProvisionGrantStep extends ProvisionStepBase {
  type: 'grant'
  /** Granted to `target.packageId` — the one step type that needs it. */
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
  index: number
  type: ProvisionStepType
  label: string
  success: boolean
  /** Failed, but `continueOnError` kept the routine going. */
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
  /** A routine with no steps is `success: true` with no steps — not an error. */
  error?: string
}

/** Emitted before each step starts, for the status bar's flow slot (28b2). */
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

// Config backup (area 17) — mirrors src/main/types.

/** One rotating pre-write snapshot of `config.json`. */
export interface ConfigSnapshot {
  /** Basename inside the snapshots directory — also the restore handle. */
  fileName: string
  /** ISO timestamp parsed off the filename. */
  savedAt: string
  size: number
}

/** Outcome of an export/import. `filePath: null` means the user cancelled. */
export interface BundleResult {
  success: boolean
  filePath: string | null
  projectCount: number
  error?: string
}

// Sync (spec: docs/specs/sync-screen.md) — mirrors src/main/types

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
  /** Dotted key path to the deployment list inside both YAMLs (19c) — a convention of the connector's format, so it's configured, not... */
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
  /** Same-day revision from a trailing `_N`, kept apart from the date. */
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

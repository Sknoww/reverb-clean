import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import logger, { applyLoggingConfig } from '../logger'
import {
  AdbCommand,
  BehaviorConfig,
  Config,
  ConfigSnapshot,
  LoggingConfig,
  LogLevel,
  ProvisionConfig,
  ProvisionStep,
  ProvisionStepType,
  SyncConfig,
  SyncProfile,
  TargetConfig
} from '../types'
import { setProjectsDirectory } from './projectManager'

const configFilePath = path.join(app.getPath('userData'), 'config.json')
const lockFilePath = configFilePath + '.lock'
const snapshotsDir = path.join(app.getPath('userData'), 'config-snapshots')

/** How many rotating pre-write snapshots to keep — a few KB each, so this is the whole disk cost of the feature (`maxSnapshots` × config size). */
const DEFAULT_MAX_SNAPSHOTS = 5

/** 19c: the dotted key path to the deployment list. */
const defaultSyncConfig: SyncConfig = {
  sourceFile: '',
  targetFile: '',
  deploymentPath: '',
  profiles: []
}

/** Dotted in config and in the field, segments everywhere else. */
const normalizeDeploymentPath = (value: any): string =>
  typeof value === 'string'
    ? value
        .split('.')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('.')
    : ''

/** 18b's defaults are the constants they replaced, so upgrading an existing config changes no behaviour — every value below is what the... */
const defaultBehaviorConfig: BehaviorConfig = {
  flowDelayMs: 5000,
  adbTimeoutMs: 15_000,
  jsTimeoutMs: 10_000,
  // Area 28, and new like `adbTimeoutMs` was — there is no constant it replaces.
  provisionTimeoutMs: 300_000
}

const defaultLoggingConfig: LoggingConfig = {
  level: 'info',
  maxAgeDays: 7,
  maxFiles: 10
}

/** The empty target — still the per-field fallback, and still a real state. */
const defaultTargetConfig: TargetConfig = {
  packageId: '',
  launcherActivity: '',
  scriptProviderUri: '',
  speechIntent: '',
  barcodeIntent: ''
}

/** Area 28's empty routine, kept as the per-field fallback for the same reason `defaultTargetConfig` is. */
const defaultProvisionConfig: ProvisionConfig = {
  sourceRoot: '',
  steps: []
}

// Seeded client defaults Area 19 stripped the client's identifying values out of the source and made every `target` field default to...

const SEEDED_TARGET: TargetConfig = {
  packageId: 'com.teamviewer.frontline.client',
  // Note the second namespace: the package is `com.teamviewer.*` (post- acquisition) and the activity is still `de.ubimax.*` (pre-).
  launcherActivity: 'de.ubimax.android.client.XActivityLauncher',
  scriptProviderUri: 'content://com.teamviewer.frontline.scriptengineprovider/execute',
  speechIntent: 'frontline.intent.action.SPEECH',
  barcodeIntent: 'frontline.intent.action.BARCODE'
}

/** The dotted key both connector YAMLs carry their deployment list under. */
const SEEDED_DEPLOYMENT_PATH = 'fc.workflow.deployment'

/** The routine that was hand-run between the clear and the relaunch: make the artifact directory, push the workflow artifacts into it,... */
const SEEDED_PROVISION_STEPS: ProvisionStep[] = [
  {
    id: 'c11c42bd-65a4-4f28-b94b-8c3fa7598a11',
    label: 'Create artifact directory',
    type: 'shell',
    command: 'mkdir -p /sdcard/ubimax',
    // Already there is the common case, and `mkdir` fails on it.
    continueOnError: true
  },
  {
    id: '913c0e5b-e213-431a-abab-5a910d35f060',
    label: 'Push workflow artifacts',
    type: 'push',
    source: 'Frontline/',
    destination: '/sdcard/ubimax/'
  },
  {
    id: 'db427d35-8004-40b0-8af7-31c6827e66d6',
    label: 'Grant runtime permissions',
    type: 'grant',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_PHONE_STATE'
    ]
  }
]

/** Apply the seeds to whatever is unconfigured, leaving everything else exactly as it was. */
const seedClientDefaults = (config: Config): Config => {
  const targetUnset = Object.values(config.target).every((value) => !value)

  return {
    ...config,
    target: targetUnset ? { ...SEEDED_TARGET } : config.target,
    // `sync` is optional on `Config` — spread the default block first so this
    // stays total, rather than asserting a shape validation happens to produce.
    sync: {
      ...defaultSyncConfig,
      ...config.sync,
      deploymentPath: config.sync?.deploymentPath || SEEDED_DEPLOYMENT_PATH
    },
    provision: {
      ...config.provision,
      // Deep copy rather than a spread: the `grant` step carries an array, and a seeded config handing out the module constant's own array would...
      steps:
        config.provision.steps.length > 0
          ? config.provision.steps
          : structuredClone(SEEDED_PROVISION_STEPS)
    }
  }
}

/** Seeded, so the file a first launch writes carries the client values rather than five empty strings someone has to fill in — and so the... */
const defaultConfig: Config = seedClientDefaults({
  saveLocation: path.join(app.getPath('userData'), 'projects'),
  currentDeviceId: '',
  recentProjectId: '',
  mostRecentProjectIds: [],
  commonCommands: [],
  dockCollapsed: false,
  connectorRoot: '',
  sync: defaultSyncConfig,
  adbPath: '',
  maxSnapshots: DEFAULT_MAX_SNAPSHOTS,
  behavior: defaultBehaviorConfig,
  logging: defaultLoggingConfig,
  target: defaultTargetConfig,
  provision: defaultProvisionConfig
})

const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug']

/** Every numeric field 18b added is a bound, and a bound out of range is worse than no field: a 0ms adb timeout kills every command, a... */
const clampInt = (value: any, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/** Mirrored by Settings' inputs — the renderer clamps to the same range. */
export const BEHAVIOR_BOUNDS = {
  flowDelayMs: { min: 0, max: 600_000 },
  adbTimeoutMs: { min: 1_000, max: 300_000 },
  jsTimeoutMs: { min: 1_000, max: 300_000 },
  // Wider at both ends than the two above: a `wait`-free routine of small shell
  // steps wants seconds, a folder push wants half an hour.
  provisionTimeoutMs: { min: 5_000, max: 1_800_000 }
} as const

/** A `wait` step's own pause — `flowDelayMs`' range, for the same kind of value. */
export const PROVISION_WAIT_BOUNDS = { min: 0, max: 600_000 } as const

export const LOGGING_BOUNDS = {
  maxAgeDays: { min: 1, max: 365 },
  maxFiles: { min: 1, max: 500 }
} as const

export const SNAPSHOT_BOUNDS = { min: 1, max: 50 } as const

/** `fallback` is what an unusable value degrades to, and it is not always the module default. */
const validateBehaviorConfig = (
  behavior: any,
  fallback: BehaviorConfig = defaultBehaviorConfig
): BehaviorConfig => {
  if (!behavior || typeof behavior !== 'object') return { ...fallback }

  return {
    flowDelayMs: clampInt(
      behavior.flowDelayMs,
      BEHAVIOR_BOUNDS.flowDelayMs.min,
      BEHAVIOR_BOUNDS.flowDelayMs.max,
      fallback.flowDelayMs
    ),
    adbTimeoutMs: clampInt(
      behavior.adbTimeoutMs,
      BEHAVIOR_BOUNDS.adbTimeoutMs.min,
      BEHAVIOR_BOUNDS.adbTimeoutMs.max,
      fallback.adbTimeoutMs
    ),
    jsTimeoutMs: clampInt(
      behavior.jsTimeoutMs,
      BEHAVIOR_BOUNDS.jsTimeoutMs.min,
      BEHAVIOR_BOUNDS.jsTimeoutMs.max,
      fallback.jsTimeoutMs
    ),
    provisionTimeoutMs: clampInt(
      behavior.provisionTimeoutMs,
      BEHAVIOR_BOUNDS.provisionTimeoutMs.min,
      BEHAVIOR_BOUNDS.provisionTimeoutMs.max,
      fallback.provisionTimeoutMs
    )
  }
}

const validateLoggingConfig = (
  logging: any,
  fallback: LoggingConfig = defaultLoggingConfig
): LoggingConfig => {
  if (!logging || typeof logging !== 'object') return { ...fallback }

  return {
    level: LOG_LEVELS.includes(logging.level) ? logging.level : fallback.level,
    maxAgeDays: clampInt(
      logging.maxAgeDays,
      LOGGING_BOUNDS.maxAgeDays.min,
      LOGGING_BOUNDS.maxAgeDays.max,
      fallback.maxAgeDays
    ),
    maxFiles: clampInt(
      logging.maxFiles,
      LOGGING_BOUNDS.maxFiles.min,
      LOGGING_BOUNDS.maxFiles.max,
      fallback.maxFiles
    )
  }
}

/** Every target field is a free string, so validation is only "is it a string" — there's no vocabulary to check against without the repo... */
const validateTargetConfig = (
  target: any,
  fallback: TargetConfig = defaultTargetConfig
): TargetConfig => {
  if (!target || typeof target !== 'object') return { ...fallback }

  const field = (value: any, fallbackValue: string): string =>
    typeof value === 'string' ? value.trim() : fallbackValue

  return {
    packageId: field(target.packageId, fallback.packageId),
    launcherActivity: field(target.launcherActivity, fallback.launcherActivity),
    scriptProviderUri: field(target.scriptProviderUri, fallback.scriptProviderUri),
    speechIntent: field(target.speechIntent, fallback.speechIntent),
    barcodeIntent: field(target.barcodeIntent, fallback.barcodeIntent)
  }
}

const PROVISION_STEP_TYPES: ProvisionStepType[] = ['shell', 'push', 'grant', 'wait']

/** A step whose required fields are missing is dropped, not repaired — the `commonCommands` rule, and it matters more here: a `push` with... */
const validateProvisionStep = (step: any, index: number): ProvisionStep | null => {
  if (!step || typeof step !== 'object') return null
  if (!PROVISION_STEP_TYPES.includes(step.type)) return null

  const text = (value: any): string => (typeof value === 'string' ? value.trim() : '')
  const base = {
    id: typeof step.id === 'string' && step.id ? step.id : `${step.type}-${index}`,
    ...(text(step.label) ? { label: text(step.label) } : {})
  }

  switch (step.type as ProvisionStepType) {
    case 'shell': {
      const command = text(step.command)
      if (!command) return null
      return {
        ...base,
        type: 'shell',
        command,
        ...(step.continueOnError === true ? { continueOnError: true } : {})
      }
    }
    case 'push': {
      const source = text(step.source)
      const destination = text(step.destination)
      if (!source || !destination) return null
      return {
        ...base,
        type: 'push',
        source,
        destination,
        ...(step.sync === true ? { sync: true } : {})
      }
    }
    case 'grant': {
      const permissions = Array.isArray(step.permissions)
        ? step.permissions.map(text).filter(Boolean)
        : []
      if (permissions.length === 0) return null
      return { ...base, type: 'grant', permissions }
    }
    case 'wait':
      return {
        ...base,
        type: 'wait',
        durationMs: clampInt(
          step.durationMs,
          PROVISION_WAIT_BOUNDS.min,
          PROVISION_WAIT_BOUNDS.max,
          0
        )
      }
  }
}

const validateProvisionConfig = (
  provision: any,
  fallback: ProvisionConfig = defaultProvisionConfig
): ProvisionConfig => {
  if (!provision || typeof provision !== 'object')
    return { ...fallback, steps: [...fallback.steps] }

  return {
    sourceRoot:
      typeof provision.sourceRoot === 'string' ? provision.sourceRoot.trim() : fallback.sourceRoot,
    steps: Array.isArray(provision.steps)
      ? provision.steps
          .map(validateProvisionStep)
          .filter((step: ProvisionStep | null): step is ProvisionStep => step !== null)
      : [...fallback.steps]
  }
}

const validateSyncConfig = (sync: any): SyncConfig => {
  if (!sync || typeof sync !== 'object') return { ...defaultSyncConfig }

  return {
    sourceFile: typeof sync.sourceFile === 'string' ? sync.sourceFile : '',
    targetFile: typeof sync.targetFile === 'string' ? sync.targetFile : '',
    // No fallback block needed the way 18b1's validators need one: this arrives already merged over what's on disk, so an omitted key still...
    deploymentPath: normalizeDeploymentPath(sync.deploymentPath),
    profiles: Array.isArray(sync.profiles)
      ? sync.profiles
          .map((profile: any): SyncProfile | null => {
            if (!profile || typeof profile !== 'object') return null
            if (typeof profile.id !== 'string' || typeof profile.name !== 'string') return null

            return {
              id: profile.id,
              name: profile.name,
              zones: Array.isArray(profile.zones)
                ? profile.zones.filter((zone: any) => typeof zone === 'string')
                : []
            }
          })
          .filter((profile: SyncProfile | null): profile is SyncProfile => profile !== null)
      : [],
    // Empty string is how the renderer detaches from a profile (S3's "Work ad-hoc"): `updateSyncConfig` merges partials, so there's no way to...
    ...(typeof sync.activeProfileId === 'string' && sync.activeProfileId
      ? { activeProfileId: sync.activeProfileId }
      : {})
  }
}

// Validate and fill in missing config fields with defaults
const validateAndFillConfig = (config: any): Config => {
  return {
    saveLocation:
      typeof config.saveLocation === 'string' ? config.saveLocation : defaultConfig.saveLocation,
    currentDeviceId:
      typeof config.currentDeviceId === 'string'
        ? config.currentDeviceId
        : defaultConfig.currentDeviceId,
    recentProjectId:
      typeof config.recentProjectId === 'string'
        ? config.recentProjectId
        : defaultConfig.recentProjectId,
    mostRecentProjectIds: Array.isArray(config.mostRecentProjectIds)
      ? config.mostRecentProjectIds.filter((id: any) => typeof id === 'string')
      : defaultConfig.mostRecentProjectIds,
    commonCommands: Array.isArray(config.commonCommands)
      ? config.commonCommands
          .map((cmd: any) => {
            if (cmd && typeof cmd === 'object' && cmd.name && cmd.keyword && cmd.type) {
              return {
                id: cmd.id || `${cmd.keyword}-${Date.now()}`,
                name: cmd.name,
                keyword: cmd.keyword,
                type: cmd.type,
                value: cmd.value || '',
                description: cmd.description || ''
              }
            }
            return null
          })
          .filter((cmd: any) => cmd !== null)
      : defaultConfig.commonCommands,
    dockCollapsed:
      typeof config.dockCollapsed === 'boolean'
        ? config.dockCollapsed
        : defaultConfig.dockCollapsed,
    connectorRoot:
      typeof config.connectorRoot === 'string' ? config.connectorRoot : defaultConfig.connectorRoot,
    sync: validateSyncConfig(config.sync),
    adbPath: typeof config.adbPath === 'string' ? config.adbPath : defaultConfig.adbPath,
    maxSnapshots: clampInt(
      config.maxSnapshots,
      SNAPSHOT_BOUNDS.min,
      SNAPSHOT_BOUNDS.max,
      DEFAULT_MAX_SNAPSHOTS
    ),
    behavior: validateBehaviorConfig(config.behavior),
    logging: validateLoggingConfig(config.logging),
    target: validateTargetConfig(config.target),
    provision: validateProvisionConfig(config.provision)
  }
}

// In-process serializer for config updates.
let writeQueue: Promise<unknown> = Promise.resolve()

// Helper function to create a simple file lock
const acquireLock = async (maxRetries = 50, retryDelay = 100): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to create lock file exclusively
      fs.writeFileSync(lockFilePath, process.pid.toString(), { flag: 'wx' })
      return true
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // Lock file exists, check if process is still alive
        try {
          const lockContent = fs.readFileSync(lockFilePath, 'utf-8')
          const lockPid = parseInt(lockContent)

          // Check if the process that created the lock is still running
          try {
            process.kill(lockPid, 0) // Signal 0 just checks if process exists
            // Process exists, wait and retry
          } catch {
            // Process doesn't exist, remove stale lock
            fs.unlinkSync(lockFilePath)
            continue
          }
        } catch {
          // Can't read lock file, remove it
          try {
            fs.unlinkSync(lockFilePath)
            continue
          } catch {}
        }

        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      } else {
        logger.error('Failed to acquire lock:', error)
        return false
      }
    }
  }
  return false
}

// Synchronous lock acquisition for loadConfig (which must remain synchronous)
const acquireLockSync = (maxRetries = 20, retryDelayMs = 50): boolean => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.writeFileSync(lockFilePath, process.pid.toString(), { flag: 'wx' })
      return true
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        try {
          const lockContent = fs.readFileSync(lockFilePath, 'utf-8')
          const lockPid = parseInt(lockContent)
          try {
            process.kill(lockPid, 0)
          } catch {
            fs.unlinkSync(lockFilePath)
            continue
          }
        } catch {
          try {
            fs.unlinkSync(lockFilePath)
            continue
          } catch {}
        }
        // Busy wait (keeps function synchronous)
        const start = Date.now()
        while (Date.now() - start < retryDelayMs) {
          /* wait */
        }
      } else {
        logger.error('Failed to acquire lock (sync):', error)
        return false
      }
    }
  }
  return false
}

const releaseLock = (): void => {
  try {
    fs.unlinkSync(lockFilePath)
  } catch {
    // Lock might already be removed, which is fine
  }
}

/** Parse + validate the config file. */
const readConfigUnlocked = (): Config | null => {
  if (!fs.existsSync(configFilePath)) return null

  const configData = fs.readFileSync(configFilePath, 'utf-8')
  if (!configData.trim()) throw new Error('Config file is empty')

  return seedClientDefaults(validateAndFillConfig(JSON.parse(configData)))
}

/** Preserve a config we couldn't parse, before anything else touches it. */
const backupCorruptConfig = (): void => {
  try {
    if (!fs.existsSync(configFilePath)) return
    const backupPath = configFilePath + '.backup.' + Date.now()
    fs.copyFileSync(configFilePath, backupPath)
    logger.info('Backed up unreadable config to:', backupPath)
  } catch (error) {
    logger.error('Failed to back up unreadable config:', error)
  }
}

/** Temp file + rename, so a crash mid-write can't leave a truncated config. */
const writeConfigUnlocked = (serialized: string): void => {
  const tempFilePath = configFilePath + '.tmp'

  try {
    fs.writeFileSync(tempFilePath, serialized, 'utf-8')
    fs.renameSync(tempFilePath, configFilePath)
  } catch (error) {
    try {
      fs.unlinkSync(tempFilePath)
    } catch {}
    throw error
  }
}

// Rotating snapshots (area 17) Until now the only backup was `config.json.backup.<ts>`, written *only* when the file failed to parse — so...

const snapshotFilePattern = /^config-(\d+)(?:-(\d+))?\.json$/

/** Newest first. */
export const listConfigSnapshots = (): ConfigSnapshot[] => {
  try {
    if (!fs.existsSync(snapshotsDir)) return []

    return fs
      .readdirSync(snapshotsDir)
      .map((fileName) => {
        const match = snapshotFilePattern.exec(fileName)
        if (!match) return null

        try {
          return {
            fileName,
            savedAt: new Date(Number(match[1])).toISOString(),
            size: fs.statSync(path.join(snapshotsDir, fileName)).size
          }
        } catch {
          return null
        }
      })
      .filter((entry): entry is ConfigSnapshot => entry !== null)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  } catch (error) {
    logger.error('Failed to list config snapshots:', error)
    return []
  }
}

/** Archive the bytes currently on disk. */
const snapshotCurrentFile = (keep: number): void => {
  try {
    if (!fs.existsSync(configFilePath)) return

    const raw = fs.readFileSync(configFilePath, 'utf-8')

    // Skip when the newest snapshot already holds these exact bytes — otherwise
    // an unrelated field churning would push real history out of the window.
    const existing = listConfigSnapshots()
    if (existing.length > 0) {
      try {
        if (fs.readFileSync(path.join(snapshotsDir, existing[0].fileName), 'utf-8') === raw) return
      } catch {
        // Unreadable newest snapshot — take a fresh one rather than skip.
      }
    }

    fs.mkdirSync(snapshotsDir, { recursive: true })

    // Writes are serialised, but two in the same millisecond would still collide.
    const stamp = Date.now()
    let target = path.join(snapshotsDir, `config-${stamp}.json`)
    for (let n = 1; fs.existsSync(target); n++) {
      target = path.join(snapshotsDir, `config-${stamp}-${n}.json`)
    }
    fs.writeFileSync(target, raw, 'utf-8')

    // Rotate: drop everything past the newest `keep`.
    for (const stale of listConfigSnapshots().slice(keep)) {
      try {
        fs.unlinkSync(path.join(snapshotsDir, stale.fileName))
      } catch {}
    }
  } catch (error) {
    // A snapshot is best-effort: never let it block the write it precedes.
    logger.error('Failed to snapshot config:', error)
  }
}

/** Applied to the freshly-read config to produce the config to write. */
type ConfigMutator = (current: Config) => Config

/** The one path that changes config (area 17). */
const runUpdate = async (mutate: ConfigMutator, maxRetries = 3): Promise<boolean> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let lockAcquired = false

    try {
      lockAcquired = await acquireLock()
      if (!lockAcquired) throw new Error('Could not acquire file lock')

      let current: Config
      try {
        current = readConfigUnlocked() ?? { ...defaultConfig }
      } catch (error: any) {
        // Unreadable rather than absent: keep a copy, then rebuild from defaults
        // instead of wedging every future write on a file we can't parse.
        logger.error('Config unreadable, updating from defaults:', error.message)
        backupCorruptConfig()
        current = { ...defaultConfig }
      }

      const next = validateAndFillConfig(mutate(current))
      const serialized = JSON.stringify(next, null, 2)

      // No-op elision: an update that changes nothing doesn't write.
      if (fs.existsSync(configFilePath) && serialized === JSON.stringify(current, null, 2)) {
        releaseLock()
        lockAcquired = false
        return true
      }

      // Archive what we're about to replace, then write.
      snapshotCurrentFile(next.maxSnapshots)
      writeConfigUnlocked(serialized)
      releaseLock()
      lockAcquired = false

      if (next.saveLocation) setProjectsDirectory(next.saveLocation)

      // Logging is applied here rather than from the update helper, so it also follows a snapshot restore and a bundle import — both of which...
      applyLoggingConfig(next.logging)
      return true
    } catch (error: any) {
      logger.warn(`Config update attempt ${attempt + 1} failed:`, error.message)

      if (attempt === maxRetries - 1) {
        logger.error('All config update attempts failed:', error)
        return false
      }

      // Back off before retrying.
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100))
    } finally {
      if (lockAcquired) releaseLock()
    }
  }

  return false
}

/** Serialise updates within this process; `runUpdate` handles the rest. */
const queueUpdate = (mutate: ConfigMutator): Promise<boolean> => {
  const result = writeQueue.then(() => runUpdate(mutate))

  // Swallow on the queue chain only — a failed update must not poison the next.
  writeQueue = result.then(
    () => {},
    () => {}
  )

  return result
}

export const loadConfig = (): Config => {
  let lockAcquired = false

  try {
    // Lock before reading, so a read can't land mid-write.
    lockAcquired = acquireLockSync()
    if (!lockAcquired) {
      logger.warn('Could not acquire lock for config read, proceeding without lock')
    }

    const config = readConfigUnlocked()
    if (config) {
      setProjectsDirectory(config.saveLocation)
      return config
    }
  } catch (error: any) {
    // Exists but unreadable: back it up and hand back defaults *without*
    // overwriting, so the original stays recoverable.
    logger.error('Failed to load config:', error.message)
    backupCorruptConfig()
    return { ...defaultConfig }
  } finally {
    if (lockAcquired) releaseLock()
  }

  // Only create defaults if the file truly does not exist.
  logger.info('No config found, creating with defaults')
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2))
  } catch (error) {
    logger.error('Failed to create default config:', error)
  }
  return { ...defaultConfig }
}

/** Merge a partial into the config on disk. */
export const saveConfig = async (partial: Partial<Config>): Promise<boolean> =>
  queueUpdate((current) => ({ ...current, ...partial }))

export const getConfigFilePath = (): string => {
  return configFilePath
}

// Every helper below mutates *inside* the lock via `queueUpdate`.

export const updateRecentProjectId = async (projectId: string): Promise<void> => {
  logger.info('Updating recent project ID:', projectId)
  const success = await queueUpdate((current) => ({ ...current, recentProjectId: projectId }))
  if (!success) logger.error('Failed to update recent project ID')
}

export const updateRecentProjectIds = async (
  previousProjectId: string,
  newProjectId: string
): Promise<void> => {
  const success = await queueUpdate((current) => {
    // Drop the project being opened, push the one being left, keep the last 5.
    const mostRecentProjectIds = current.mostRecentProjectIds
      .filter((projectId) => projectId !== newProjectId)
      .concat(previousProjectId)
      .slice(-5)

    return { ...current, mostRecentProjectIds }
  })

  if (!success) logger.error('Failed to update most recent project IDs')
}

export const updateCommonCommands = async (commands: AdbCommand[]): Promise<void> => {
  const success = await queueUpdate((current) => ({ ...current, commonCommands: commands }))
  if (!success) logger.error('Failed to update common commands')
}

export const updateDockCollapsed = async (collapsed: boolean): Promise<void> => {
  const success = await queueUpdate((current) => ({ ...current, dockCollapsed: collapsed }))
  if (!success) logger.error('Failed to update dock collapsed state')
}

export const updateConnectorRoot = async (connectorRoot: string): Promise<void> => {
  logger.info('Updating connector root:', connectorRoot)
  const success = await queueUpdate((current) => ({ ...current, connectorRoot }))
  if (!success) logger.error('Failed to update connector root')
}

/** Roll config back to a snapshot. */
export const restoreConfigSnapshot = async (fileName: string): Promise<boolean> => {
  // Also the path-traversal guard: the pattern admits no separators.
  if (!snapshotFilePattern.test(fileName)) {
    logger.error('Refusing to restore an unrecognised snapshot name:', fileName)
    return false
  }

  let restored: Config
  try {
    const raw = fs.readFileSync(path.join(snapshotsDir, fileName), 'utf-8')
    restored = validateAndFillConfig(JSON.parse(raw))
  } catch (error: any) {
    logger.error(`Failed to read snapshot ${fileName}:`, error.message)
    return false
  }

  logger.info('Restoring config from snapshot:', fileName)
  return queueUpdate(() => restored)
}

/** Replace config wholesale — bundle import only (area 17's restore path). */
export const replaceConfig = async (config: Config): Promise<boolean> => queueUpdate(() => config)

export const updateSyncConfig = async (sync: Partial<SyncConfig>): Promise<void> => {
  const success = await queueUpdate((current) => ({
    ...current,
    sync: validateSyncConfig({ ...(current.sync ?? defaultSyncConfig), ...sync })
  }))

  if (!success) logger.error('Failed to update sync config')
}

// Area 18b — the blocks Settings' Behavior and Logging sections write.

export const updateBehaviorConfig = async (behavior: Partial<BehaviorConfig>): Promise<void> => {
  const success = await queueUpdate((current) => {
    const currentBehavior = current.behavior ?? defaultBehaviorConfig
    return {
      ...current,
      // Fallback is the *current* block, so an unusable incoming value leaves
      // that field as the user set it rather than resetting it to the default.
      behavior: validateBehaviorConfig({ ...currentBehavior, ...behavior }, currentBehavior)
    }
  })

  if (!success) logger.error('Failed to update behavior config')
}

export const updateLoggingConfig = async (logging: Partial<LoggingConfig>): Promise<void> => {
  const success = await queueUpdate((current) => {
    const currentLogging = current.logging ?? defaultLoggingConfig
    return {
      ...current,
      logging: validateLoggingConfig({ ...currentLogging, ...logging }, currentLogging)
    }
  })

  if (!success) logger.error('Failed to update logging config')
}

/** Area 19. */
export const updateTargetConfig = async (target: Partial<TargetConfig>): Promise<void> => {
  const success = await queueUpdate((current) => {
    const currentTarget = current.target ?? defaultTargetConfig
    return {
      ...current,
      target: validateTargetConfig({ ...currentTarget, ...target }, currentTarget)
    }
  })

  if (!success) logger.error('Failed to update target config')
}

/** Area 28. */
export const updateProvisionConfig = async (provision: Partial<ProvisionConfig>): Promise<void> => {
  const success = await queueUpdate((current) => {
    const currentProvision = current.provision ?? defaultProvisionConfig
    return {
      ...current,
      provision: validateProvisionConfig({ ...currentProvision, ...provision }, currentProvision)
    }
  })

  if (!success) logger.error('Failed to update provision config')
}

export const updateAdbPath = async (adbPath: string): Promise<void> => {
  logger.info('Updating adb path override:', adbPath || '(bundled)')
  const success = await queueUpdate((current) => ({ ...current, adbPath }))
  if (!success) logger.error('Failed to update adb path')
}

export const updateMaxSnapshots = async (maxSnapshots: number): Promise<void> => {
  const success = await queueUpdate((current) => ({
    // Same rule as the blocks above: an unusable value keeps the current cap
    // rather than snapping back to the default.
    ...current,
    maxSnapshots: clampInt(
      maxSnapshots,
      SNAPSHOT_BOUNDS.min,
      SNAPSHOT_BOUNDS.max,
      current.maxSnapshots
    )
  }))
  if (!success) logger.error('Failed to update snapshot retention')
}

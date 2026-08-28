import { BehaviorConfig, LoggingConfig, LogLevel } from '@/types'
import {
  SETTINGS_BUTTON,
  SettingsDivider,
  SettingsNumber,
  SettingsRow,
  SettingsSelect
} from './settingsSection'

// Settings' Behavior and Logging sections (area 18b) — the values that were compiled-in constants until now.

const BOUNDS = {
  flowDelayMs: { min: 0, max: 600_000 },
  adbTimeoutMs: { min: 1_000, max: 300_000 },
  jsTimeoutMs: { min: 1_000, max: 300_000 },
  // Wider at both ends than the two above (28a's block, surfaced in 28b1): a
  // routine of small shell steps wants seconds, a folder push wants half an hour.
  provisionTimeoutMs: { min: 5_000, max: 1_800_000 },
  maxAgeDays: { min: 1, max: 365 },
  maxFiles: { min: 1, max: 500 }
} as const

const LOG_LEVELS: readonly { value: LogLevel; label: string }[] = [
  { value: 'error', label: 'error' },
  { value: 'warn', label: 'warn' },
  { value: 'info', label: 'info' },
  { value: 'debug', label: 'debug' }
]

export function BehaviorSettings({
  behavior,
  onChanged
}: {
  behavior: BehaviorConfig
  onChanged: () => Promise<void> | void
}) {
  const update = async (patch: Partial<BehaviorConfig>) => {
    await window.configAPI.updateBehaviorConfig(patch)
    await onChanged()
  }

  return (
    <>
      <SettingsNumber
        label="New flow delay"
        // The distinction that stops this reading as a global override: flows
        // carry their own delay once created, and this only seeds the next one.
        hint="Seeds the inter-command delay of a new flow. Existing flows keep their own."
        unit="ms"
        value={behavior.flowDelayMs}
        min={BOUNDS.flowDelayMs.min}
        max={BOUNDS.flowDelayMs.max}
        onCommit={(flowDelayMs) => void update({ flowDelayMs })}
      />

      <SettingsDivider />

      <SettingsNumber
        label="ADB timeout"
        hint="How long any adb invocation may run before it's killed."
        unit="ms"
        value={behavior.adbTimeoutMs}
        min={BOUNDS.adbTimeoutMs.min}
        max={BOUNDS.adbTimeoutMs.max}
        onCommit={(adbTimeoutMs) => void update({ adbTimeoutMs })}
      />

      <SettingsDivider />

      <SettingsNumber
        label="JS Console timeout"
        hint="How long a script may run on the device before Run gives up."
        unit="ms"
        value={behavior.jsTimeoutMs}
        min={BOUNDS.jsTimeoutMs.min}
        max={BOUNDS.jsTimeoutMs.max}
        onCommit={(jsTimeoutMs) => void update({ jsTimeoutMs })}
      />

      <SettingsDivider />

      {/* 28b1. */}
      <SettingsNumber
        label="Provisioning timeout"
        hint="Ceiling on a single provisioning step. Its own bound because a folder push is minutes, not seconds."
        unit="ms"
        value={behavior.provisionTimeoutMs}
        min={BOUNDS.provisionTimeoutMs.min}
        max={BOUNDS.provisionTimeoutMs.max}
        onCommit={(provisionTimeoutMs) => void update({ provisionTimeoutMs })}
      />
    </>
  )
}

export function LoggingSettings({
  logging,
  onChanged
}: {
  logging: LoggingConfig
  onChanged: () => Promise<void> | void
}) {
  const update = async (patch: Partial<LoggingConfig>) => {
    await window.configAPI.updateLoggingConfig(patch)
    await onChanged()
  }

  const handleOpenLogs = async () => {
    const directory = await window.loggerAPI.getLogsDirectory()
    if (directory) await window.dialogAPI.openInEditor(directory)
  }

  return (
    <>
      <SettingsSelect
        label="Level"
        // Worth stating: winston's level is settable at runtime, so main
        // re-applies it on every config write rather than at launch only.
        hint="Applies immediately — no restart. `debug` is loud; it logs every ADB invocation."
        value={logging.level}
        options={LOG_LEVELS}
        onChange={(level) => void update({ level })}
      />

      <SettingsDivider />

      <SettingsNumber
        label="Keep logs for"
        hint="Files older than this are deleted by the daily cleanup."
        unit="days"
        value={logging.maxAgeDays}
        min={BOUNDS.maxAgeDays.min}
        max={BOUNDS.maxAgeDays.max}
        onCommit={(maxAgeDays) => void update({ maxAgeDays })}
      />

      <SettingsDivider />

      <SettingsNumber
        label="Keep at most"
        hint="A hard cap whatever their age — one file is written per launch."
        unit="files"
        value={logging.maxFiles}
        min={BOUNDS.maxFiles.min}
        max={BOUNDS.maxFiles.max}
        onCommit={(maxFiles) => void update({ maxFiles })}
      />

      <SettingsDivider />

      <SettingsRow label="Log files" hint="Open the logs directory.">
        <button type="button" onClick={handleOpenLogs} className={SETTINGS_BUTTON}>
          Open directory…
        </button>
      </SettingsRow>
    </>
  )
}

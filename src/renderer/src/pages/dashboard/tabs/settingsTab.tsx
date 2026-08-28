import { useScrollMemory } from '@/lib/hooks/use-scroll-memory'
import {
  AdbCommand,
  BehaviorConfig,
  Config,
  LoggingConfig,
  ProvisionConfig,
  TargetConfig
} from '@/types'
import { BehaviorSettings, LoggingSettings } from '../components/settingsBehavior'
import { SettingsCommonCommands } from '../components/settingsCommonCommands'
import { SettingsData } from '../components/settingsData'
import { ProvisioningSettings } from '../components/settingsProvisioning'
import { SettingsSection } from '../components/settingsSection'
import { TargetSettings } from '../components/settingsTarget'
import { SETTINGS_TARGET_SECTION } from '../components/targetNotice'
import { DEPLOYMENT_FIELD, PathField, PathSpec } from '../components/syncPaths'
import { ValueField } from '../components/valueField'
import { useSyncContext } from '../contexts/syncContext'
import { Fragment } from 'react'
import { useLocation } from 'react-router-dom'

// The Settings screen (area 18a) — the last screen the redesign never touched, rebuilt inside the shell as one scrolling column of titled...

/** Which config field a path row writes, and how it gets there. */
type PathKey = 'saveLocation' | 'connectorRoot' | 'sourceFile' | 'targetFile' | 'adbPath'

const PATH_SPECS = (connectorRoot: string): PathSpec<PathKey>[] => [
  {
    key: 'saveLocation',
    label: 'Projects',
    hint: 'where .project.json files are kept',
    pick: () => window.configAPI.selectSaveLocation()
  },
  {
    key: 'connectorRoot',
    label: 'Connector root',
    hint: 'the checkout Sync composes local paths from',
    pick: () => window.dialogAPI.selectFolder('Select the connector checkout', connectorRoot)
  },
  {
    key: 'sourceFile',
    label: 'Sync source',
    hint: "the connector's source YAML — read only",
    pick: () => window.dialogAPI.selectYamlFile("Select the connector's source YAML", connectorRoot)
  },
  {
    key: 'targetFile',
    label: 'Sync target',
    hint: 'the local YAML Sync edits',
    pick: () => window.dialogAPI.selectYamlFile('Select your local YAML', connectorRoot)
  },
  {
    key: 'adbPath',
    label: 'ADB binary',
    // Unset reads `Not set` like the others, which would be wrong here — unset
    // is a working state, not a missing one — so the hint carries what happens.
    hint: 'override the bundled platform-tools; unset uses the bundled adb',
    pick: () => window.dialogAPI.selectExecutable('Select adb')
  }
]

/** Placeholders for the first frame only. */
const FALLBACK_BEHAVIOR: BehaviorConfig = {
  flowDelayMs: 5000,
  adbTimeoutMs: 15_000,
  jsTimeoutMs: 10_000,
  provisionTimeoutMs: 300_000
}

const FALLBACK_LOGGING: LoggingConfig = { level: 'info', maxAgeDays: 7, maxFiles: 10 }

/** Area 28's block is empty by default too — same rule, same reason. */
const FALLBACK_PROVISION: ProvisionConfig = { sourceRoot: '', steps: [] }

/** Area 19's block is empty by default, so its placeholder *is* the default. */
const FALLBACK_TARGET: TargetConfig = {
  packageId: '',
  launcherActivity: '',
  scriptProviderUri: '',
  speechIntent: '',
  barcodeIntent: ''
}

// Unset is not an error here — Sync's own first-run card is where a missing path is a blocker (frame 6d).

export function SettingsTab({
  config,
  onConfigChanged,
  onAddCommonCommand,
  onEditCommonCommand,
  onDeleteCommonCommand,
  onReorderCommonCommands
}: {
  config: Config
  /** Re-read config in the shell — this screen never holds its own copy. */
  onConfigChanged: () => Promise<void> | void
  // The library's mutations are the shell's (18b2) — the same four the dock calls.
  onAddCommonCommand: () => void
  onEditCommonCommand: (command: AdbCommand) => void
  onDeleteCommonCommand: (command: AdbCommand) => void
  onReorderCommonCommands: (commands: AdbCommand[]) => void
}) {
  const sync = useSyncContext()

  // A screen can arrive here pointing at one section (19a's target notice).
  const location = useLocation()
  const requested = (location.state as { section?: string } | null)?.section
  const revealKeyFor = (section: string) => (requested === section ? location.key : undefined)

  // Restores where the column was left. A section link still wins: `SettingsSection`
  // reveals from an effect and a frame later, both after the restore below.
  const columnRef = useScrollMemory('settings')

  const connectorRoot = config.connectorRoot ?? ''

  const values: Record<PathKey, string> = {
    saveLocation: config.saveLocation,
    connectorRoot,
    sourceFile: config.sync?.sourceFile ?? '',
    targetFile: config.sync?.targetFile ?? '',
    adbPath: config.adbPath ?? ''
  }

  const changePath = async (key: PathKey, value: string) => {
    if (key === 'saveLocation') {
      // `runUpdate` re-points projectManager's directory as part of the write,
      // so there's nothing to notify afterwards.
      await window.configAPI.saveConfig({ saveLocation: value })
    } else if (key === 'connectorRoot') {
      await window.configAPI.updateConnectorRoot(value)
    } else if (key === 'adbPath') {
      await window.configAPI.updateAdbPath(value)
    } else {
      await window.configAPI.updateSyncConfig({ [key]: value })
    }

    await onConfigChanged()

    // Sync's rule 3: never trust a previous read once a path moves.
    if (key !== 'saveLocation' && key !== 'adbPath') await sync.rescan()
  }

  // 19c.
  const changeDeploymentPath = async (value: string) => {
    await window.configAPI.updateSyncConfig({ deploymentPath: value })
    await onConfigChanged()
    await sync.rescan()
  }

  return (
    <div
      ref={columnRef}
      className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1"
      style={{ scrollbarGutter: 'stable' }}
    >
      <div className="flex w-full max-w-[720px] flex-col gap-6">
        <SettingsSection
          title="Paths"
          description="Where Reverb reads and writes on this machine, and the key it reads inside the YAMLs. Changing anything Sync depends on re-scans immediately."
        >
          {PATH_SPECS(connectorRoot).map((spec) => (
            <Fragment key={spec.key}>
              <PathField
                spec={spec}
                value={values[spec.key]}
                onChange={(key, value) => void changePath(key, value)}
                // Only the ADB override has a meaningful empty state to return to.
                clearLabel={spec.key === 'adbPath' ? 'Use bundled' : undefined}
              />
              {/* Ordered by what it belongs with, not by control type: the key is the third thing Sync needs from the connector, so it lands under the... */}
              {spec.key === 'targetFile' && (
                <ValueField
                  {...DEPLOYMENT_FIELD}
                  value={config.sync?.deploymentPath ?? ''}
                  onCommit={(value) => void changeDeploymentPath(value)}
                />
              )}
            </Fragment>
          ))}
        </SettingsSection>

        <SettingsSection
          title="Behavior"
          description="Timings the app used to hard-code. Each applies to the next run — nothing here needs a restart."
        >
          <BehaviorSettings
            behavior={config.behavior ?? FALLBACK_BEHAVIOR}
            onChanged={onConfigChanged}
          />
        </SettingsSection>

        <SettingsSection title="Logging">
          <LoggingSettings
            logging={config.logging ?? FALLBACK_LOGGING}
            onChanged={onConfigChanged}
          />
        </SettingsSection>

        <SettingsSection
          title="Common commands"
          description="The global command library — the same rows the dock shows on every other screen."
        >
          <SettingsCommonCommands
            commands={config.commonCommands}
            onAdd={onAddCommonCommand}
            onEdit={onEditCommonCommand}
            onDelete={onDeleteCommonCommand}
            onReorder={onReorderCommonCommands}
          />
        </SettingsSection>

        {/* 18b2 shipped this section empty and area 19 filled it — which is why the frame landed early: 19 became a config change plus rows rather... */}
        <SettingsSection
          title="Target"
          description="Which Android client Reverb drives. Every command, the Reset client action, and the JS Console compose against these — until they're set, those capabilities are off."
          revealKey={revealKeyFor(SETTINGS_TARGET_SECTION)}
        >
          <TargetSettings target={config.target ?? FALLBACK_TARGET} onChanged={onConfigChanged} />
        </SettingsSection>

        {/* After Target and before Data (28b1). */}
        <SettingsSection
          title="Provisioning"
          description="Steps that run after a storage clear and before the client comes back up — pushing artifacts and granting the permissions its first launch would otherwise prompt for. Also runnable on its own."
          defaultOpen={false}
        >
          <ProvisioningSettings
            provision={config.provision ?? FALLBACK_PROVISION}
            onChanged={onConfigChanged}
          />
        </SettingsSection>

        <SettingsSection title="Data">
          <SettingsData
            maxSnapshots={config.maxSnapshots ?? 5}
            onConfigReplaced={() => void onConfigChanged()}
          />
        </SettingsSection>
      </div>
    </div>
  )
}

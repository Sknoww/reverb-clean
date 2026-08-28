import { TargetConfig } from '@/types'
import { ValueField } from './valueField'

// Settings → Target (area 19).

interface TargetFieldSpec {
  key: keyof TargetConfig
  label: string
  hint: string
  placeholder: string
}

const TARGET_FIELDS: TargetFieldSpec[] = [
  {
    key: 'packageId',
    label: 'Package id',
    hint: 'the client application id',
    placeholder: 'com.example.client'
  },
  {
    key: 'launcherActivity',
    label: 'Launcher activity',
    hint: 'started by Reset client',
    placeholder: 'com.example.client.MainActivity'
  },
  {
    key: 'scriptProviderUri',
    label: 'Script provider URI',
    hint: 'queried by the JS Console',
    placeholder: 'content://com.example.scriptprovider/execute'
  },
  {
    key: 'speechIntent',
    label: 'Speech intent action',
    hint: 'broadcast for speech commands',
    placeholder: 'com.example.intent.action.SPEECH'
  },
  {
    key: 'barcodeIntent',
    label: 'Barcode intent action',
    hint: 'broadcast for barcode commands',
    placeholder: 'com.example.intent.action.BARCODE'
  }
]

export function TargetSettings({
  target,
  onChanged
}: {
  target: TargetConfig
  /** Re-read config in the shell — this screen never holds its own copy (18a). */
  onChanged: () => Promise<void> | void
}) {
  const update = async (key: keyof TargetConfig, value: string) => {
    // A partial, merged inside main's lock: the other four survive a screen that
    // read them a minute ago (area 17's shape).
    await window.configAPI.updateTargetConfig({ [key]: value })
    await onChanged()
  }

  return (
    <>
      {TARGET_FIELDS.map((spec) => (
        <ValueField
          key={spec.key}
          label={spec.label}
          hint={spec.hint}
          placeholder={spec.placeholder}
          value={target[spec.key] ?? ''}
          onCommit={(value) => void update(spec.key, value)}
        />
      ))}
    </>
  )
}

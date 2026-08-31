import { TargetConfig } from '@/types'
import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface TargetCapabilities {
  commands: boolean

  reset: boolean

  scripts: boolean
}

export function targetCapabilities(target?: TargetConfig): TargetCapabilities {
  return {
    commands: Boolean(target?.barcodeIntent || target?.speechIntent),
    reset: Boolean(target?.packageId && target?.launcherActivity),
    scripts: Boolean(target?.scriptProviderUri)
  }
}

export const SETTINGS_TARGET_SECTION = 'target'

export const TARGET_MESSAGES = {
  commands: 'No target configured — set the barcode and speech intent actions to send commands.',
  scripts: 'No target configured — set the script provider URI to run scripts.'
} as const

export function TargetNotice({ message }: { message: string }) {
  return (
    <div className="flex flex-shrink-0 items-start gap-2 rounded-[9px] border border-hairline bg-surface-panel px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-stale" aria-hidden />
      <span>
        {message}{' '}
        <Link
          to="/settings"
          state={{ section: SETTINGS_TARGET_SECTION }}
          className="text-foreground underline decoration-hairline underline-offset-2 transition-colors hover:decoration-current"
        >
          Open Settings → Target
        </Link>
      </span>
    </div>
  )
}

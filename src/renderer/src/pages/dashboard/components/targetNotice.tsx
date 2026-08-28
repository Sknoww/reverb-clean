import { TargetConfig } from '@/types'
import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

// Area 19.

/** What the currently configured target lets the app do. */
export interface TargetCapabilities {
  /** Send commands — at least one intent action is set. */
  commands: boolean
  /** Reset client — both halves, since force-stop without a relaunch is worse. */
  reset: boolean
  /** Run JS Console scripts. */
  scripts: boolean
}

/** Per-capability rather than one boolean: the three don't come from the same fields, and a target with intents but no provider URI should... */
export function targetCapabilities(target?: TargetConfig): TargetCapabilities {
  return {
    commands: Boolean(target?.barcodeIntent || target?.speechIntent),
    reset: Boolean(target?.packageId && target?.launcherActivity),
    scripts: Boolean(target?.scriptProviderUri)
  }
}

/** The section this notice points at, as both sides of the navigation know it. */
export const SETTINGS_TARGET_SECTION = 'target'

/** Copy lives here so the three screens can't drift into three explanations. */
export const TARGET_MESSAGES = {
  commands: 'No target configured — set the barcode and speech intent actions to send commands.',
  scripts: 'No target configured — set the script provider URI to run scripts.'
} as const

/** The app's existing notice shape (Sync's apply modal, §1.9): hairline panel, `TriangleAlert` in `stale`, muted body. */
export function TargetNotice({ message }: { message: string }) {
  return (
    <div className="flex flex-shrink-0 items-start gap-2 rounded-[9px] border border-hairline bg-surface-panel px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-stale" aria-hidden />
      <span>
        {message}{' '}
        <Link
          to="/settings"
          // Target is five sections down a long scrolling column, so the link names where it's going and Settings expands + scrolls to it.
          state={{ section: SETTINGS_TARGET_SECTION }}
          className="text-foreground underline decoration-hairline underline-offset-2 transition-colors hover:decoration-current"
        >
          Open Settings → Target
        </Link>
      </span>
    </div>
  )
}

import { cn } from '@/lib/utils'
import { ScreenPermissionStatus } from '@/types'
import { ShieldQuestion } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmModal } from './confirmModal'
import { SETTINGS_BUTTON, SettingsRow } from './settingsSection'
import { screenPermissionActions, screenPermissionCopy } from './screenPermissionCopy'

export function useScreenPermissionStatus(active = true) {
  const [status, setStatus] = useState<ScreenPermissionStatus | null>(null)
  const refresh = useCallback(async () => {
    if (!active) return
    setStatus(await window.screenPermissionAPI.getStatus())
  }, [active])

  useEffect(() => {
    if (!active) {
      setStatus(null)
      return
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
    }
  }, [active, refresh])

  useEffect(() => {
    if (status?.recovery !== 'awaiting-approval') return
    const interval = window.setInterval(() => void refresh(), 1500)
    return () => window.clearInterval(interval)
  }, [refresh, status?.recovery])

  return { status, refresh }
}

export function RepairScreenPermissionModal({
  open,
  onClose,
  onError
}: {
  open: boolean
  onClose: () => void
  onError: (error: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const repair = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const result = await window.screenPermissionAPI.repair()
    if (!result.success) {
      busyRef.current = false
      setBusy(false)
      onClose()
      onError(result.error ?? 'Screen Recording repair failed.')
      return
    }
    await window.screenPermissionAPI.relaunch()
  }

  return (
    <ConfirmModal
      isOpen={open}
      onClose={() => !busy && onClose()}
      onConfirm={() => void repair()}
      marker={<ShieldQuestion className="h-3.5 w-3.5 text-amber-200" aria-hidden />}
      title="Repair Screen Recording?"
      confirmLabel={busy ? 'Repairing…' : 'Repair and relaunch'}
      description="Reset only Reverb's Screen Recording decision and relaunch the app."
    >
      <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
        <p>
          Reverb will reset only its own Screen Recording decision. Permissions for other apps are
          untouched.
        </p>
        <p>
          After relaunch, run one scan to recreate Reverb in macOS Settings, enable it there, then
          use Relaunch now. macOS requires you to make that final security choice.
        </p>
      </div>
    </ConfirmModal>
  )
}

export function SettingsScreenCapture() {
  const { status } = useScreenPermissionStatus()
  const [confirmRepair, setConfirmRepair] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = status ? screenPermissionCopy(status) : { label: 'Checking…', hint: undefined }
  const actions = status
    ? screenPermissionActions(status)
    : { repair: false, openSettings: false, relaunch: false }

  return (
    <>
      <SettingsRow label="Screen capture" hint={copy.hint}>
        <span
          className={cn(
            'text-xs font-medium',
            status?.status === 'allowed' ? 'text-emerald-300' : 'text-zinc-300'
          )}
        >
          {copy.label}
        </span>
        {actions.repair && (
          <button type="button" onClick={() => setConfirmRepair(true)} className={SETTINGS_BUTTON}>
            Repair…
          </button>
        )}
        {actions.openSettings && (
          <button
            type="button"
            onClick={() => void window.screenPermissionAPI.openSettings()}
            className={SETTINGS_BUTTON}
          >
            Open Settings
          </button>
        )}
        {actions.relaunch && (
          <button
            type="button"
            onClick={() => void window.screenPermissionAPI.relaunch()}
            className={SETTINGS_BUTTON}
          >
            Relaunch now
          </button>
        )}
      </SettingsRow>
      {error && (
        <p role="alert" className="text-xs leading-snug text-red-300">
          {error}
        </p>
      )}
      <RepairScreenPermissionModal
        open={confirmRepair}
        onClose={() => setConfirmRepair(false)}
        onError={setError}
      />
    </>
  )
}

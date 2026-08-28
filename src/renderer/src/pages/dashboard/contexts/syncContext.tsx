import { SyncApplyResult, SyncEntry, SyncPlan, SyncProfile, SyncScanResult } from '@/types'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useLocation } from 'react-router-dom'

// Sync screen state (S2), lifted above the shell's <Outlet> for the same reason `DeviceProvider` was (C8): more than one region renders it.

// Profiles (S3, spec D5, frames 6b/6f) are named *sets of zones*, stored in app config.

/** Locally derived counterpart of the manager's plan — drives the Apply badge. */
export interface SyncPending {
  adds: string[]
  removes: string[]
  bumps: string[]
  total: number
}

interface SyncContextType {
  scan: SyncScanResult | null
  scanning: boolean
  /** Re-reads both YAMLs (rule 3: never cached — source moves on every branch switch). */
  rescan: () => Promise<void>
  /** All four values set — false means the first-run card (frame 6d). */
  configured: boolean

  /** Zones that should be in the local YAML after Apply. */
  selected: Set<string>
  toggleZone: (zone: string, next: boolean) => void
  setZones: (zones: string[], next: boolean) => void
  pending: SyncPending

  /** Apply preview (frame 6c) — the one destructive moment (D9). */
  previewOpen: boolean
  openPreview: () => void
  closePreview: () => void
  plan: SyncPlan | null
  planning: boolean
  planError: string | null
  applying: boolean
  applyError: string | null
  apply: () => Promise<void>
  /** `✓ wrote N changes`, shown briefly in the status bar after a write. */
  applyNotice: string | null
  /** Wall-clock of the last successful scan, for the status bar. */
  scannedAt: Date | null

  // ---- profiles (S3) ------------------------------------------------------
  profiles: SyncProfile[]
  activeProfile: SyncProfile | null
  /** Selection has drifted from the active profile — the `MODIFIED` badge. */
  profileDirty: boolean
  /** Profile zones this scan can't represent — skip-with-notice, per profile. */
  missingZones: (profile: SyncProfile) => string[]
  /** Set as the selection (D5), minus anything the scan doesn't know about. */
  selectProfile: (id: string) => Promise<void>
  /** Stamp the current selection onto the active profile. */
  saveActiveProfile: () => Promise<void>
  /** Put the selection back to what the active profile holds. */
  revertToProfile: () => void
  /** Save the current selection as a new profile, and make it active. */
  createProfile: (name: string) => Promise<void>
  renameProfile: (id: string, name: string) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  /** Drop the profile link, keep the selection — frame 6f's ad-hoc state. */
  detachProfile: () => Promise<void>
  /** `Skipped N zones…` after selecting a profile with zones this scan lacks. */
  profileNotice: string | null
}

const SyncContext = createContext<SyncContextType | null>(null)

export function useSyncContext() {
  const context = useContext(SyncContext)
  if (!context) {
    throw new Error('useSyncContext must be used within a SyncProvider')
  }
  return context
}

/** The baseline selection: whatever the local YAML already deploys. */
const zonesInTarget = (entries: SyncEntry[]): Set<string> =>
  new Set(entries.filter((entry) => entry.inTarget).map((entry) => entry.zone))

const sameZones = (a: Set<string>, b: string[]): boolean =>
  a.size === b.length && b.every((zone) => a.has(zone))

export function SyncProvider({ children }: { children: ReactNode }) {
  const [scan, setScan] = useState<SyncScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scannedAt, setScannedAt] = useState<Date | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [previewOpen, setPreviewOpen] = useState(false)
  const [plan, setPlan] = useState<SyncPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyNotice, setApplyNotice] = useState<string | null>(null)

  const [profiles, setProfiles] = useState<SyncProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [profileNotice, setProfileNotice] = useState<string | null>(null)

  // Profiles live in app config, not in the YAML — read once; every mutation
  // below writes through `persistProfiles`, so config and state can't drift.
  useEffect(() => {
    void window.configAPI.getConfig().then((config) => {
      setProfiles(config.sync?.profiles ?? [])
      setActiveProfileId(config.sync?.activeProfileId ?? null)
    })
  }, [])

  // Whether anything is staged. Read by `rescan` without making it depend on
  // the selection, so a re-scan never re-runs just because a box was ticked.
  const stagedRef = useRef(false)

  const rescan = useCallback(async () => {
    setScanning(true)
    try {
      const result = await window.syncAPI.scan()
      setScan(result)
      // A failed scan leaves the previous selection alone — re-seeding from an
      // empty entry list would silently stage a removal of everything.
      if (!result.ok) return
      setScannedAt(new Date())
      // Re-seed from the local YAML unless the tester has staged something.
      if (!stagedRef.current) setSelected(zonesInTarget(result.entries))
    } catch (error) {
      console.error('Sync scan failed:', error)
    } finally {
      setScanning(false)
    }
  }, [])

  // Rule 3: the source file changes behind the app's back on every branch switch, so entering the route is always a fresh read — and nothing...
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname !== '/sync') return
    void rescan()
  }, [pathname, rescan])

  const toggleZone = useCallback((zone: string, next: boolean) => {
    setSelected((prev) => {
      const updated = new Set(prev)
      if (next) updated.add(zone)
      else updated.delete(zone)
      return updated
    })
  }, [])

  const setZones = useCallback((zones: string[], next: boolean) => {
    setSelected((prev) => {
      const updated = new Set(prev)
      for (const zone of zones) {
        if (next) updated.add(zone)
        else updated.delete(zone)
      }
      return updated
    })
  }, [])

  // Mirrors `buildPlan` in syncManager: an unselected target entry is a remove, a selected non-target entry an add, and a selected...
  const pending = useMemo<SyncPending>(() => {
    const entries = scan?.entries ?? []
    const adds: string[] = []
    const removes: string[] = []
    const bumps: string[] = []

    for (const entry of entries) {
      const isSelected = selected.has(entry.zone)
      if (entry.inTarget && !isSelected) removes.push(entry.zone)
      else if (!entry.inTarget && isSelected) adds.push(entry.zone)
      else if (isSelected && entry.status === 'outOfDate') bumps.push(entry.zone)
    }

    return { adds, removes, bumps, total: adds.length + removes.length + bumps.length }
  }, [scan, selected])

  stagedRef.current = pending.total > 0

  const openPreview = useCallback(async () => {
    setPreviewOpen(true)
    setPlan(null)
    setPlanError(null)
    setApplyError(null)
    setPlanning(true)
    try {
      // The preview is the manager's plan, never the locally derived one — the
      // renderer's `pending` sizes a badge, the main process owns the truth.
      const result = await window.syncAPI.plan([...selected])
      if (result.ok && result.plan) setPlan(result.plan)
      else setPlanError(result.error ?? 'Could not build the apply preview.')
    } catch (error: any) {
      setPlanError(error?.message ?? 'Could not build the apply preview.')
    } finally {
      setPlanning(false)
    }
  }, [selected])

  const closePreview = useCallback(() => {
    setPreviewOpen(false)
    setApplyError(null)
  }, [])

  const apply = useCallback(async () => {
    setApplying(true)
    setApplyError(null)
    try {
      const result: SyncApplyResult = await window.syncAPI.apply([...selected])
      if (!result.success) {
        // Rule 7 / frame 6c: failure keeps the modal open with the error.
        setApplyError(result.error ?? 'The write failed. Nothing was written.')
        return
      }

      const written = result.plan
        ? result.plan.adds.length + result.plan.removes.length + result.plan.bumps.length
        : 0
      setPreviewOpen(false)
      setApplyNotice(`✓ wrote ${written} change${written === 1 ? '' : 's'}`)
      // Success settles inline — re-scan so every written row reads `current`.
      await rescan()
    } catch (error: any) {
      setApplyError(error?.message ?? 'The write failed. Nothing was written.')
    } finally {
      setApplying(false)
    }
  }, [selected, rescan])

  useEffect(() => {
    if (!applyNotice) return
    const timer = setTimeout(() => setApplyNotice(null), 2500)
    return () => clearTimeout(timer)
  }, [applyNotice])

  // ---- profiles (S3) -------------------------------------------------------

  /** Every zone this scan knows — source, target, or both. */
  const knownZones = useMemo(
    () => new Set((scan?.ok ? scan.entries : []).map((entry) => entry.zone)),
    [scan]
  )

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  )

  const missingZones = useCallback(
    (profile: SyncProfile) => profile.zones.filter((zone) => !knownZones.has(zone)),
    [knownZones]
  )

  // Dirty compares against what the profile can *currently* express: a zone the scan doesn't carry can't be ticked, so counting it would...
  const profileDirty = useMemo(() => {
    if (!activeProfile || !scan?.ok) return false
    return !sameZones(
      selected,
      activeProfile.zones.filter((zone) => knownZones.has(zone))
    )
  }, [activeProfile, scan, selected, knownZones])

  const persistProfiles = useCallback(async (next: SyncProfile[], activeId: string | null) => {
    setProfiles(next)
    setActiveProfileId(activeId)
    // '' is the detach signal — `updateSyncConfig` merges partials, so an
    // omitted key would keep the old value rather than clear it.
    await window.configAPI.updateSyncConfig({ profiles: next, activeProfileId: activeId ?? '' })
  }, [])

  const applyProfileSelection = useCallback(
    (profile: SyncProfile) => {
      const usable = profile.zones.filter((zone) => knownZones.has(zone))
      const skipped = profile.zones.length - usable.length
      setSelected(new Set(usable))
      setProfileNotice(
        skipped > 0 ? `Skipped ${skipped} zone${skipped === 1 ? '' : 's'} not in this scan` : null
      )
    },
    [knownZones]
  )

  const selectProfile = useCallback(
    async (id: string) => {
      const profile = profiles.find((entry) => entry.id === id)
      if (!profile) return
      applyProfileSelection(profile)
      await persistProfiles(profiles, id)
    },
    [profiles, applyProfileSelection, persistProfiles]
  )

  const saveActiveProfile = useCallback(async () => {
    if (!activeProfile) return
    // Stamping drops zones this scan couldn't show — which is what "save
    // changes" means; the tester is looking at the set they're saving.
    const next = profiles.map((profile) =>
      profile.id === activeProfile.id ? { ...profile, zones: [...selected] } : profile
    )
    await persistProfiles(next, activeProfile.id)
  }, [activeProfile, profiles, selected, persistProfiles])

  const revertToProfile = useCallback(() => {
    if (!activeProfile) return
    applyProfileSelection(activeProfile)
  }, [activeProfile, applyProfileSelection])

  const createProfile = useCallback(
    async (name: string) => {
      const profile: SyncProfile = { id: crypto.randomUUID(), name, zones: [...selected] }
      await persistProfiles([...profiles, profile], profile.id)
    },
    [profiles, selected, persistProfiles]
  )

  const renameProfile = useCallback(
    async (id: string, name: string) => {
      const next = profiles.map((profile) => (profile.id === id ? { ...profile, name } : profile))
      await persistProfiles(next, activeProfileId)
    },
    [profiles, activeProfileId, persistProfiles]
  )

  const deleteProfile = useCallback(
    async (id: string) => {
      const next = profiles.filter((profile) => profile.id !== id)
      // Deleting the active one leaves the selection alone — it's the tester's
      // working set (rule 8), and it only loses its label.
      await persistProfiles(next, activeProfileId === id ? null : activeProfileId)
    },
    [profiles, activeProfileId, persistProfiles]
  )

  const detachProfile = useCallback(async () => {
    await persistProfiles(profiles, null)
  }, [profiles, persistProfiles])

  useEffect(() => {
    if (!profileNotice) return
    const timer = setTimeout(() => setProfileNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [profileNotice])

  // 19c added the deployment key.
  const configured = Boolean(
    scan?.connectorRoot && scan?.sourceFile && scan?.targetFile && scan?.deploymentPath
  )

  return (
    <SyncContext.Provider
      value={{
        scan,
        scanning,
        rescan,
        configured,
        selected,
        toggleZone,
        setZones,
        pending,
        previewOpen,
        openPreview,
        closePreview,
        plan,
        planning,
        planError,
        applying,
        applyError,
        apply,
        applyNotice,
        scannedAt,
        profiles,
        activeProfile,
        profileDirty,
        missingZones,
        selectProfile,
        saveActiveProfile,
        revertToProfile,
        createProfile,
        renameProfile,
        deleteProfile,
        detachProfile,
        profileNotice
      }}
    >
      {children}
    </SyncContext.Provider>
  )
}

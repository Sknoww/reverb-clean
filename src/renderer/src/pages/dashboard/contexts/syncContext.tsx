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

export interface SyncPending {
  adds: string[]
  removes: string[]
  bumps: string[]
  total: number
}

interface SyncContextType {
  scan: SyncScanResult | null
  scanning: boolean

  rescan: () => Promise<void>

  configured: boolean

  selected: Set<string>
  toggleZone: (zone: string, next: boolean) => void
  setZones: (zones: string[], next: boolean) => void
  pending: SyncPending

  previewOpen: boolean
  openPreview: () => void
  closePreview: () => void
  plan: SyncPlan | null
  planning: boolean
  planError: string | null
  applying: boolean
  applyError: string | null
  apply: () => Promise<void>

  applyNotice: string | null

  scannedAt: Date | null

  profiles: SyncProfile[]
  activeProfile: SyncProfile | null

  profileDirty: boolean

  missingZones: (profile: SyncProfile) => string[]

  selectProfile: (id: string) => Promise<void>

  saveActiveProfile: () => Promise<void>

  revertToProfile: () => void

  createProfile: (name: string) => Promise<void>
  renameProfile: (id: string, name: string) => Promise<void>
  deleteProfile: (id: string) => Promise<void>

  detachProfile: () => Promise<void>

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

  useEffect(() => {
    void window.configAPI.getConfig().then((config) => {
      setProfiles(config.sync?.profiles ?? [])
      setActiveProfileId(config.sync?.activeProfileId ?? null)
    })
  }, [])

  // Rescans must not replace a selection with pending edits.
  const stagedRef = useRef(false)

  const rescan = useCallback(async () => {
    setScanning(true)
    try {
      const result = await window.syncAPI.scan()
      setScan(result)

      // Preserve the previous selection when a scan fails.
      if (!result.ok) return
      setScannedAt(new Date())

      if (!stagedRef.current) setSelected(zonesInTarget(result.entries))
    } catch (error) {
      console.error('Sync scan failed:', error)
    } finally {
      setScanning(false)
    }
  }, [])

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
      // The main process owns the authoritative preview.
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
        setApplyError(result.error ?? 'The write failed. Nothing was written.')
        return
      }

      const written = result.plan
        ? result.plan.adds.length + result.plan.removes.length + result.plan.bumps.length
        : 0
      setPreviewOpen(false)
      setApplyNotice(`✓ wrote ${written} change${written === 1 ? '' : 's'}`)

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

  const profileDirty = useMemo(() => {
    if (!activeProfile || !scan?.ok) return false
    // Missing zones cannot be selected, so exclude them from this comparison.
    return !sameZones(
      selected,
      activeProfile.zones.filter((zone) => knownZones.has(zone))
    )
  }, [activeProfile, scan, selected, knownZones])

  const persistProfiles = useCallback(async (next: SyncProfile[], activeId: string | null) => {
    setProfiles(next)
    setActiveProfileId(activeId)

    // An empty id explicitly detaches; omitting it would preserve the old profile.
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

      // Deleting the active profile keeps its current zone selection.
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

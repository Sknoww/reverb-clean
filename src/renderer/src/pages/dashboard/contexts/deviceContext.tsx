import { AdbDevice, Config } from '@/types'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

// Connected-device state, shared by the two places that render it (C8): the top bar's device pill (C2) and the status bar.

interface DeviceContextType {
  devices: AdbDevice[]
  selectedDeviceId: string
  // The selected device's record, when it's actually in the connected list.
  activeDevice: AdbDevice | undefined
  loading: boolean
  refresh: () => Promise<void>
  selectDevice: (deviceId: string) => void
}

const DeviceContext = createContext<DeviceContextType | null>(null)

export function useDeviceContext() {
  const context = useContext(DeviceContext)
  if (!context) {
    throw new Error('useDeviceContext must be used within a DeviceProvider')
  }
  return context
}

export function DeviceProvider({
  config,
  onDeviceChange,
  children
}: {
  config: Config
  onDeviceChange: (deviceId: string) => void
  children: ReactNode
}) {
  const [devices, setDevices] = useState<AdbDevice[]>([])
  // Seeded from the persisted id: the provider mounts after config has loaded, so a device that's still plugged in stays selected across...
  const [selectedDeviceId, setSelectedDeviceId] = useState(config.currentDeviceId ?? '')
  const [loading, setLoading] = useState(false)

  const persist = useCallback(
    (deviceId: string) => {
      // Guard against writing before config has been read from disk — until then `selectedDeviceId` is '' and refresh would persist a pick the...
      if (!config.saveLocation) return
      // One field, not the whole object (area 17).
      void window.configAPI.saveConfig({ currentDeviceId: deviceId })
    },
    [config.saveLocation]
  )

  const selectDevice = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId)
      persist(deviceId)
      onDeviceChange(deviceId)
    },
    [persist, onDeviceChange]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const connected = await window.adbAPI.getDevices()
      setDevices(connected)

      // Keep the current pick when it's still connected; otherwise fall back to the first device, or clear the selection when nothing is...
      if (selectedDeviceId && connected.some((device) => device.id === selectedDeviceId)) return
      const next = connected.length > 0 ? connected[0].id : ''
      if (next !== selectedDeviceId) selectDevice(next)
    } catch (error) {
      console.error('Failed to load devices:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedDeviceId, selectDevice])

  useEffect(() => {
    void refresh()
    // Mount only — refresh is re-run from the pill's Refresh item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeDevice = devices.find((device) => device.id === selectedDeviceId)

  return (
    <DeviceContext.Provider
      value={{ devices, selectedDeviceId, activeDevice, loading, refresh, selectDevice }}
    >
      {children}
    </DeviceContext.Provider>
  )
}

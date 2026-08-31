import { AdbDevice, Config } from '@/types'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

interface DeviceContextType {
  devices: AdbDevice[]
  selectedDeviceId: string

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

  const [selectedDeviceId, setSelectedDeviceId] = useState(config.currentDeviceId ?? '')
  const [loading, setLoading] = useState(false)

  const persist = useCallback(
    (deviceId: string) => {
      if (!config.saveLocation) return

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

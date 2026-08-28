import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import React from 'react'
import { LuCheck, LuChevronDown, LuRefreshCcw } from 'react-icons/lu'
import { useDeviceContext } from '../contexts/deviceContext'

// Device pill (redesign C2).

// The pill shows an abbreviated id beside the model name (the status bar carries
// the full one). ADB ids are either colon-grouped MACs or plain serials/host:port.
export function shortDeviceId(id: string): string {
  const parts = id.split(':')
  if (parts.length > 2) return parts.slice(0, 2).join(':')
  return id.length > 12 ? `${id.slice(0, 11)}…` : id
}

export const DeviceSelector: React.FC = () => {
  const { devices, selectedDeviceId, activeDevice, loading, refresh, selectDevice } =
    useDeviceContext()

  const active = activeDevice
  const connected = !!active
  const label = active ? (active.model ?? active.id) : 'No device'
  // Only worth showing the id fragment when the name above it isn't already the id.
  const idFragment = active?.model ? shortDeviceId(active.id) : ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={active ? `${label} (${active.id})` : 'No devices connected'}
          aria-label="Select device"
          className="flex h-[34px] flex-shrink-0 items-center gap-2 rounded-[9px] border border-border-control bg-surface-control px-2.5 transition-colors hover:border-muted-foreground/25"
        >
          <span
            className={cn(
              'h-[7px] w-[7px] flex-shrink-0 rounded-full',
              connected
                ? 'bg-status-connected shadow-[0_0_0_3px_hsl(var(--status-connected)/0.15)]'
                : 'bg-red-900'
            )}
          />
          <span
            className={cn(
              'max-w-[170px] truncate text-[13px] font-medium',
              connected ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {label}
          </span>
          {idFragment && <span className="font-mono text-[11px] text-text-dim">{idFragment}</span>}
          <LuChevronDown size={12} className="flex-shrink-0 text-glyph-dim" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-64" align="end">
        <DropdownMenuLabel className="font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-glyph-dim">
          Devices
        </DropdownMenuLabel>
        {devices.length === 0 ? (
          <DropdownMenuItem disabled>No devices connected</DropdownMenuItem>
        ) : (
          devices.map((device) => (
            <DropdownMenuItem
              key={device.id}
              className="cursor-pointer gap-2"
              onClick={() => selectDevice(device.id)}
            >
              <LuCheck
                size={14}
                className={cn('flex-shrink-0', device.id === selectedDeviceId ? '' : 'invisible')}
              />
              <span className="min-w-0 truncate">{device.model ?? device.id}</span>
              <span className="ml-auto flex-shrink-0 font-mono text-[11px] text-text-dim">
                {shortDeviceId(device.id)}
              </span>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer gap-2"
          disabled={loading}
          // Keep the menu open so the refreshed list is visible in place.
          onSelect={(event) => {
            event.preventDefault()
            void refresh()
          }}
        >
          <LuRefreshCcw size={14} className={cn('flex-shrink-0', loading && 'animate-spin')} />
          Refresh devices
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

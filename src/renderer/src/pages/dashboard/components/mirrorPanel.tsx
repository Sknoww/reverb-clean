import { cn } from '@/lib/utils'
import { useMirrorStream } from '@/lib/hooks/use-mirror-stream'
import { createKeyTracker, createTouchTracker, isAppReservedKey } from '@/lib/mirrorInput'
import { ScrcpyState } from '@/types'
import {
  KeyboardEvent,
  PointerEvent,
  WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { Loader2 } from 'lucide-react'
import { LuArrowLeft, LuChevronDown, LuChevronUp, LuHouse, LuPower } from 'react-icons/lu'
import { useDeviceContext } from '../contexts/deviceContext'

interface MirrorPanelProps {
  collapsed: boolean
  onToggleCollapsed: () => void
}

export function MirrorPanel({ collapsed, onToggleCollapsed }: MirrorPanelProps) {
  const { selectedDeviceId } = useDeviceContext()
  const [state, setState] = useState<ScrcpyState>({ running: false })
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useMirrorStream(canvasRef)

  const touch = useMemo(
    () =>
      createTouchTracker((action, point) =>
        window.adbAPI.sendScrcpyTouch(action, point.x, point.y, point.width, point.height)
      ),
    []
  )
  const keys = useMemo(
    () => createKeyTracker((action, code, meta) => window.adbAPI.sendScrcpyKey(action, code, meta)),
    []
  )

  useEffect(
    () => () => {
      touch.release()
      keys.releaseAll()
    },
    [touch, keys]
  )

  useEffect(() => {
    void window.adbAPI.scrcpyState().then(setState)
    return window.adbAPI.onScrcpyState(setState)
  }, [])

  const toggle = async () => {
    setBusy(true)
    try {
      if (state.running) {
        await window.adbAPI.stopScrcpy()
        setState({ running: false })
      } else {
        setState(await window.adbAPI.startScrcpy(selectedDeviceId))
      }
    } finally {
      setBusy(false)
    }
  }

  const videoPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const x = ((clientX - rect.left) / rect.width) * canvas.width
    const y = ((clientY - rect.top) / rect.height) * canvas.height
    return {
      x: Math.max(0, Math.min(canvas.width - 1, x)),
      y: Math.max(0, Math.min(canvas.height - 1, y)),
      width: canvas.width,
      height: canvas.height
    }
  }

  const handlePointerDown = (event: PointerEvent) => {
    const point = videoPoint(event.clientX, event.clientY)
    if (!point) return
    if (touch.down(event.pointerId, event.button, point)) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handlePointerMove = (event: PointerEvent) => {
    const point = videoPoint(event.clientX, event.clientY)
    if (point) touch.move(event.pointerId, event.buttons, point)
  }

  const handlePointerUp = (event: PointerEvent) => {
    const point = videoPoint(event.clientX, event.clientY)
    if (point) touch.up(event.pointerId, event.button, point)
    else if (event.button === 0) touch.cancel(event.pointerId)
  }

  const handlePointerCancel = (event: PointerEvent) => {
    touch.cancel(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleWheel = (event: WheelEvent) => {
    const point = videoPoint(event.clientX, event.clientY)
    if (point) {
      window.adbAPI.sendScrcpyScroll(
        point.x,
        point.y,
        event.deltaX,
        event.deltaY,
        point.width,
        point.height
      )
    }
  }

  const handleKey = (action: 'down' | 'up') => (event: KeyboardEvent) => {
    if (action === 'down' && isAppReservedKey(event.nativeEvent)) return
    event.preventDefault()
    const meta = (event.shiftKey ? 1 : 0) | (event.altKey ? 2 : 0) | (event.ctrlKey ? 4096 : 0)
    keys[action](event.code, meta)
  }

  const startDisabled = busy || (!state.running && !selectedDeviceId)

  return (
    <div className="flex flex-col border-t border-hairline bg-surface-chrome">
      <div className="flex h-11 items-center gap-2 px-5">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            state.running ? 'bg-status-connected' : 'bg-glyph-dimmer'
          )}
          aria-hidden
        />
        <span className="text-sm font-semibold">Mirror</span>
        {state.running && state.deviceId && (
          <span className="font-mono text-xs text-text-dim">{state.deviceId}</span>
        )}
        {state.error && !state.running && (
          <span className="min-w-0 truncate text-xs text-red-300" title={state.error}>
            {state.error}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {state.running && (
            <>
              <button
                type="button"
                onClick={() => window.adbAPI.sendScrcpyNav('back')}
                className="flex h-7 w-7 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
                aria-label="Back"
                title="Back"
              >
                <LuArrowLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => window.adbAPI.sendScrcpyNav('home')}
                className="flex h-7 w-7 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
                aria-label="Home"
                title="Home"
              >
                <LuHouse size={16} />
              </button>
            </>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={state.running}
            aria-busy={busy}
            disabled={startDisabled}
            onClick={() => void toggle()}
            title={
              state.running
                ? 'Stop mirroring'
                : selectedDeviceId
                  ? 'Start mirroring the selected device'
                  : 'Select a device to mirror'
            }
            className="flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <LuPower size={14} />}
            {state.running ? 'Stop' : 'Start'}
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex h-7 w-7 items-center justify-center rounded-md text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
            aria-label={collapsed ? 'Expand mirror panel' : 'Collapse mirror panel'}
            title={collapsed ? 'Expand mirror' : 'Collapse mirror'}
          >
            {collapsed ? <LuChevronUp size={16} /> : <LuChevronDown size={16} />}
          </button>
        </span>
      </div>
      <div
        className={cn(
          'flex h-[320px] items-center justify-center border-t border-hairline bg-surface-shell p-2',
          collapsed && 'hidden'
        )}
      >
        {!state.running && (
          <p className="text-xs text-muted-foreground">
            {selectedDeviceId ? 'Start to mirror the device screen' : 'No device selected'}
          </p>
        )}
        <canvas
          ref={canvasRef}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
          onBlur={() => {
            touch.release()
            keys.releaseAll()
          }}
          onWheel={handleWheel}
          onKeyDown={handleKey('down')}
          onKeyUp={handleKey('up')}
          className={cn(
            'max-h-full max-w-full touch-none select-none object-contain outline-none focus-visible:ring-1 focus-visible:ring-border-bar',
            !state.running && 'hidden'
          )}
        />
      </div>
    </div>
  )
}

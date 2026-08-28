import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { RegionSelection, RegionSelectorInit } from '../../../preload/types'

interface Point {
  x: number
  y: number
}

export const rectangleBetween = (start: Point, end: Point): RegionSelection => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y)
})

export function RegionSelector(): JSX.Element {
  const [initialization, setInitialization] = useState<RegionSelectorInit | null>(null)
  const [selection, setSelection] = useState<RegionSelection | null>(null)
  const [ownership, setOwnership] = useState({ owned: false, blocked: false })
  const start = useRef<Point | null>(null)
  const pointerId = useRef<number | null>(null)
  const crossedBoundary = useRef(false)

  useEffect(() => {
    void window.regionSelectorAPI.initialize().then((value) => {
      if (value) setInitialization(value)
    })
    const removeOwnerListener = window.regionSelectorAPI.onOwnerChanged(setOwnership)
    const cancel = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.regionSelectorAPI.cancel()
    }
    window.addEventListener('keydown', cancel)
    return () => {
      removeOwnerListener()
      window.removeEventListener('keydown', cancel)
    }
  }, [])

  const resetDrag = (): void => {
    start.current = null
    pointerId.current = null
    crossedBoundary.current = false
    setSelection(null)
    window.regionSelectorAPI.release()
  }

  const pointFromEvent = (event: ReactPointerEvent): Point => ({
    x: event.clientX,
    y: event.clientY
  })

  const outsideDisplay = (point: Point): boolean =>
    !initialization ||
    point.x < 0 ||
    point.y < 0 ||
    point.x > initialization.width ||
    point.y > initialization.height

  const handlePointerDown = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || ownership.blocked || !initialization) return
    const claimed = await window.regionSelectorAPI.claim()
    if (!claimed) return

    const point = pointFromEvent(event)
    start.current = point
    pointerId.current = event.pointerId
    crossedBoundary.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelection(rectangleBetween(point, point))
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId || !start.current) return
    const point = pointFromEvent(event)
    if (outsideDisplay(point)) crossedBoundary.current = true
    setSelection(rectangleBetween(start.current, point))
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId || !start.current || !initialization) return
    const point = pointFromEvent(event)
    const rect = rectangleBetween(start.current, point)
    const invalid =
      crossedBoundary.current || outsideDisplay(point) || rect.width < 8 || rect.height < 8

    if (invalid) {
      resetDrag()
      return
    }

    pointerId.current = null
    start.current = null
    window.regionSelectorAPI.complete(rect)
  }

  const nativeDimensions =
    initialization && selection
      ? `${Math.round(selection.width * initialization.scaleFactor)} × ${Math.round(selection.height * initialization.scaleFactor)} px`
      : null

  return (
    <div
      className={`fixed inset-0 overflow-hidden bg-black font-sans text-white select-none ${ownership.blocked ? 'cursor-default' : 'cursor-crosshair'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={resetDrag}
    >
      {initialization && (
        <img
          src={initialization.backgroundUrl}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full"
          alt=""
        />
      )}

      {ownership.blocked ? (
        <div className="pointer-events-none absolute inset-0 bg-black/70" />
      ) : selection ? (
        <div
          className="pointer-events-none absolute border border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height
          }}
        >
          {nativeDimensions && selection.width >= 52 && selection.height >= 24 && (
            <span className="absolute -top-7 left-0 rounded bg-black/80 px-2 py-1 font-mono text-[11px] whitespace-nowrap">
              {nativeDimensions}
            </span>
          )}
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/25" />
      )}

      {!selection && !ownership.blocked && initialization && (
        <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-center text-xs shadow-lg">
          <span className="font-medium">Display {initialization.displayNumber}</span>
          <span className="ml-2 text-zinc-300">Drag to select · Esc to cancel</span>
        </div>
      )}
    </div>
  )
}

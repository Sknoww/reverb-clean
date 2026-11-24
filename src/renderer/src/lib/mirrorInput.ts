export interface TouchPoint {
  x: number
  y: number
  width: number
  height: number
}

type TouchAction = 'down' | 'move' | 'up'

export const isFocusCommandBarShortcut = (e: {
  metaKey: boolean
  ctrlKey: boolean
  key: string
}): boolean => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'

// Cmd-modified keys and the command-bar shortcut stay with the app.
export const isAppReservedKey = (e: { metaKey: boolean; ctrlKey: boolean; key: string }): boolean =>
  e.metaKey || isFocusCommandBarShortcut(e)

export function createTouchTracker(send: (action: TouchAction, point: TouchPoint) => void): {
  down: (pointerId: number, button: number, point: TouchPoint) => boolean
  move: (pointerId: number, buttons: number, point: TouchPoint) => void
  up: (pointerId: number, button: number, point: TouchPoint) => boolean
  cancel: (pointerId: number) => boolean
  release: () => void
} {
  let active: { pointerId: number; last: TouchPoint } | undefined

  const release = (): void => {
    if (!active) return
    const { last } = active
    active = undefined
    send('up', last)
  }

  return {
    down: (pointerId, button, point) => {
      if (button !== 0 || active) return false
      active = { pointerId, last: point }
      send('down', point)
      return true
    },
    move: (pointerId, buttons, point) => {
      if (!active || active.pointerId !== pointerId || buttons === 0) return
      active.last = point
      send('move', point)
    },
    up: (pointerId, button, point) => {
      if (!active || active.pointerId !== pointerId || button !== 0) return false
      active = undefined
      send('up', point)
      return true
    },
    cancel: (pointerId) => {
      if (!active || active.pointerId !== pointerId) return false
      release()
      return true
    },
    release
  }
}

export function createKeyTracker(
  send: (action: 'down' | 'up', code: string, meta: number) => void
): {
  down: (code: string, meta: number) => void
  up: (code: string, meta: number) => void
  releaseAll: () => void
} {
  const pressed = new Set<string>()
  return {
    down: (code, meta) => {
      pressed.add(code)
      send('down', code, meta)
    },
    up: (code, meta) => {
      if (!pressed.delete(code)) return
      send('up', code, meta)
    },
    releaseAll: () => {
      for (const code of pressed) send('up', code, 0)
      pressed.clear()
    }
  }
}

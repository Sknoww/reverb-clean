import { describe, expect, it, vi } from 'vitest'
import { createKeyTracker, createTouchTracker, isAppReservedKey } from './mirrorInput'

const point = { x: 1, y: 2, width: 10, height: 20 }

describe('touch tracker', () => {
  it('sends an unconditional touch-up when the active pointer is cancelled', () => {
    const send = vi.fn()
    const touch = createTouchTracker(send)
    touch.down(1, 0, point)
    touch.cancel(1)
    expect(send.mock.calls.map((call) => call[0])).toEqual(['down', 'up'])
    touch.cancel(1)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('ignores non-primary buttons and other pointers', () => {
    const send = vi.fn()
    const touch = createTouchTracker(send)
    expect(touch.down(1, 2, point)).toBe(false)
    touch.down(1, 0, point)
    touch.move(2, 1, point)
    touch.up(2, 0, point)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('key forwarding', () => {
  it('reserves Ctrl+K and Cmd combinations but not other Ctrl keys', () => {
    expect(isAppReservedKey({ metaKey: false, ctrlKey: true, key: 'k' })).toBe(true)
    expect(isAppReservedKey({ metaKey: true, ctrlKey: false, key: 'a' })).toBe(true)
    expect(isAppReservedKey({ metaKey: false, ctrlKey: true, key: 'a' })).toBe(false)
  })

  it('releases pressed keys and never sends an unmatched key-up', () => {
    const send = vi.fn()
    const keys = createKeyTracker(send)
    keys.up('KeyK', 0)
    keys.down('ControlLeft', 4096)
    keys.releaseAll()
    expect(send.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['down', 'ControlLeft'],
      ['up', 'ControlLeft']
    ])
  })
})

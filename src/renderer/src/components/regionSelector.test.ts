import { describe, expect, it } from 'vitest'
import { rectangleBetween } from './regionSelector'

describe('regionSelector', () => {
  it('normalizes both drag directions into the same local rectangle', () => {
    expect(rectangleBetween({ x: 10, y: 20 }, { x: 110, y: 70 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50
    })
    expect(rectangleBetween({ x: 110, y: 70 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50
    })
  })
})

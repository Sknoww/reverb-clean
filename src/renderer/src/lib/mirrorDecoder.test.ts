import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMirrorDecoder } from './mirrorDecoder'

const CONFIG = new Uint8Array([0, 0, 1, 0x67, 0x42, 0xc0, 0x1f, 0, 0, 1, 0x68])

interface FakeDecoder {
  state: string
  decodeQueueSize: number
  configure: ReturnType<typeof vi.fn>
  decode: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  fail: () => void
}

let decoders: FakeDecoder[]
let clock: number
const requestKeyframe = vi.fn()

const mirror = () =>
  createMirrorDecoder({
    createDecoder: ({ error }) => {
      const fake: FakeDecoder = {
        state: 'unconfigured',
        decodeQueueSize: 0,
        configure: vi.fn(function () {
          fake.state = 'configured'
        }),
        decode: vi.fn(),
        close: vi.fn(function () {
          fake.state = 'closed'
        }),
        fail: () => {
          fake.state = 'closed'
          error()
        }
      }
      decoders.push(fake)
      return fake as unknown as VideoDecoder
    },
    createChunk: (init) => init as unknown as EncodedVideoChunk,
    draw: vi.fn(),
    requestKeyframe,
    now: () => clock
  })

const config = { type: 'config', data: CONFIG } as const
const key = { type: 'frame', data: new Uint8Array([1]), keyframe: true, pts: 1 } as const
const delta = { type: 'frame', data: new Uint8Array([2]), keyframe: false, pts: 2 } as const

beforeEach(() => {
  decoders = []
  clock = 0
  requestKeyframe.mockClear()
})

describe('mirror decoder', () => {
  it('recovers from a fatal decoder error with a fresh decoder', () => {
    const m = mirror()
    m.onPacket(config)
    m.onPacket(key)
    decoders[0].fail()
    clock = 2000
    m.onPacket(delta)
    expect(decoders[1]).toBeUndefined()
    expect(requestKeyframe).toHaveBeenCalled()

    m.onPacket(key)
    expect(decoders).toHaveLength(2)
    expect(decoders[1].configure).toHaveBeenCalled()
    expect(decoders[1].decode).toHaveBeenCalledTimes(1)
  })

  it('discards a decoder whose decode throws', () => {
    const m = mirror()
    m.onPacket(config)
    m.onPacket(key)
    decoders[0].decode.mockImplementation(() => {
      throw new Error('closed')
    })
    m.onPacket(delta)
    expect(decoders[0].close).toHaveBeenCalled()
  })

  it('does not resume delta decoding after an overload drop until a keyframe', () => {
    const m = mirror()
    m.onPacket(config)
    m.onPacket(key)
    decoders[0].decodeQueueSize = 99
    clock = 2000
    m.onPacket(delta)
    expect(requestKeyframe).toHaveBeenCalled()

    m.onPacket(delta)
    expect(decoders[0].decode).toHaveBeenCalledTimes(1)
    m.onPacket(key)
    expect(decoders).toHaveLength(2)
    expect(decoders[1].decode).toHaveBeenCalledTimes(1)
  })

  it('closes the current decoder on dispose', () => {
    const m = mirror()
    m.onPacket(config)
    m.onPacket(key)
    m.dispose()
    expect(decoders[0].close).toHaveBeenCalled()
  })
})

import { ScrcpyPacket } from '@/types'
import { codecFromConfig, concat } from './h264Stream'

const KEYFRAME_RETRY_MS = 1000
const MAX_QUEUE = 8

export interface MirrorDecoderDeps {
  createDecoder: (handlers: {
    output: (frame: VideoFrame) => void
    error: () => void
  }) => VideoDecoder
  createChunk: (init: EncodedVideoChunkInit) => EncodedVideoChunk
  draw: (frame: VideoFrame) => void
  requestKeyframe: () => void
  now: () => number
}

export interface MirrorDecoder {
  onPacket: (packet: ScrcpyPacket) => void
  dispose: () => void
}

const sameBytes = (a: Uint8Array, b?: Uint8Array): boolean =>
  !!b && a.length === b.length && a.every((value, index) => value === b[index])

export function createMirrorDecoder(deps: MirrorDecoderDeps): MirrorDecoder {
  let decoder: VideoDecoder | undefined
  let config: Uint8Array | undefined
  let configuredFor: Uint8Array | undefined
  let awaitingKeyframe = true
  let lastKeyframeRequest = -Infinity

  const requestKeyframe = (): void => {
    const now = deps.now()
    if (now - lastKeyframeRequest < KEYFRAME_RETRY_MS) return
    lastKeyframeRequest = now
    deps.requestKeyframe()
  }

  const discard = (): void => {
    const old = decoder
    decoder = undefined
    configuredFor = undefined
    awaitingKeyframe = true
    if (old && old.state !== 'closed') {
      try {
        old.close()
      } catch {
        // already closed
      }
    }
  }

  const create = (): VideoDecoder => {
    const created: VideoDecoder = deps.createDecoder({
      output: (frame) => {
        if (decoder !== created) return frame.close()
        deps.draw(frame)
        frame.close()
      },
      error: () => {
        if (decoder !== created) return
        discard()
        requestKeyframe()
      }
    })
    return created
  }

  const onPacket = (packet: ScrcpyPacket): void => {
    if (packet.type === 'config') {
      config = packet.data
      return
    }
    if (!config) return

    if (packet.keyframe) {
      const codec = codecFromConfig(config)
      if (!codec) return
      try {
        if (!decoder || decoder.state === 'closed') decoder = create()
        if (decoder.state !== 'configured' || !sameBytes(config, configuredFor)) {
          decoder.configure({
            codec,
            avc: { format: 'annexb' },
            optimizeForLatency: true
          } as VideoDecoderConfig)
          configuredFor = config
        }
        awaitingKeyframe = false
      } catch {
        discard()
        requestKeyframe()
        return
      }
    }

    if (awaitingKeyframe || !decoder || decoder.state !== 'configured') {
      requestKeyframe()
      return
    }

    // Dropping a delta frame breaks the reference chain, so decoding stops until a fresh keyframe.
    if (!packet.keyframe && decoder.decodeQueueSize > MAX_QUEUE) {
      discard()
      requestKeyframe()
      return
    }

    try {
      decoder.decode(
        deps.createChunk({
          type: packet.keyframe ? 'key' : 'delta',
          timestamp: packet.pts ?? deps.now() * 1000,
          data: packet.keyframe ? concat([config, packet.data]) : packet.data
        })
      )
    } catch {
      discard()
      requestKeyframe()
    }
  }

  return { onPacket, dispose: discard }
}

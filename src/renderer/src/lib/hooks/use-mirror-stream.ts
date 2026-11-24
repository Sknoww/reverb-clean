import { RefObject, useEffect } from 'react'
import { createMirrorDecoder } from '../mirrorDecoder'

// Decodes scrcpy video packets onto a canvas; mounted for the app's lifetime.
export function useMirrorStream(canvasRef: RefObject<HTMLCanvasElement>): void {
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || typeof VideoDecoder === 'undefined') return

    const mirror = createMirrorDecoder({
      createDecoder: (handlers) => new VideoDecoder(handlers),
      createChunk: (init) => new EncodedVideoChunk(init),
      draw: (frame) => {
        if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth
        if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight
        context.drawImage(frame, 0, 0)
      },
      requestKeyframe: () => void window.adbAPI.requestScrcpyKeyframe(),
      now: () => performance.now()
    })

    const unsubscribe = window.adbAPI.onScrcpyPacket(mirror.onPacket)

    return () => {
      unsubscribe()
      mirror.dispose()
    }
  }, [canvasRef])
}

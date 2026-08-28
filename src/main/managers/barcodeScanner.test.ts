import { existsSync, readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  prepareZXingModule as prepareWriter,
  writeBarcode,
  type CreatableBarcodeFormat
} from 'zxing-wasm/writer'
import { decodeBarcodes, resolveBarcodeWasmPath } from './barcodeScanner'

const originalFetch = globalThis.fetch
const blockedFetch = vi.fn(() => Promise.reject(new Error('network disabled')))

const pngFor = async (text: string, format: CreatableBarcodeFormat): Promise<Buffer> => {
  const written = await writeBarcode(text, { format, scale: 6 })
  if (!written.image) throw new Error('ZXing writer did not return a PNG fixture')
  return Buffer.from(await written.image.arrayBuffer())
}

const rotateClockwise = (encoded: Buffer): Buffer => {
  const source = PNG.sync.read(encoded)
  const rotated = new PNG({ width: source.height, height: source.width })

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4
      const targetX = source.height - y - 1
      const targetY = x
      const targetOffset = (targetY * rotated.width + targetX) * 4
      source.data.copy(rotated.data, targetOffset, sourceOffset, sourceOffset + 4)
    }
  }

  return PNG.sync.write(rotated)
}

const invert = (encoded: Buffer): Buffer => {
  const image = PNG.sync.read(encoded)
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = 255 - image.data[offset]
    image.data[offset + 1] = 255 - image.data[offset + 1]
    image.data[offset + 2] = 255 - image.data[offset + 2]
  }
  return PNG.sync.write(image)
}

const combine = (leftBytes: Buffer, rightBytes: Buffer): Buffer => {
  const left = PNG.sync.read(leftBytes)
  const right = PNG.sync.read(rightBytes)
  const gap = 48
  const canvas = new PNG({
    width: left.width + gap + right.width,
    height: Math.max(left.height, right.height),
    fill: true
  })
  canvas.data.fill(255)
  PNG.bitblt(left, canvas, 0, 0, left.width, left.height, 0, 0)
  PNG.bitblt(right, canvas, 0, 0, right.width, right.height, left.width + gap, 0)
  return PNG.sync.write(canvas)
}

beforeAll(async () => {
  globalThis.fetch = blockedFetch as typeof fetch
  const writerWasm = Uint8Array.from(
    readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm'))
  )
  await prepareWriter({
    overrides: { wasmBinary: writerWasm.buffer },
    fireImmediately: true
  })
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

describe('barcodeScanner', () => {
  it('resolves the matching reader WASM from the installed package without networking', async () => {
    const wasmPath = resolveBarcodeWasmPath()
    expect(existsSync(wasmPath)).toBe(true)
    expect(wasmPath.replace(/\\/g, '/')).toContain('/zxing-wasm/dist/reader/zxing_reader.wasm')

    const result = await decodeBarcodes(await pngFor('offline', 'QRCode'))
    expect(result.status).toBe('found')
    expect(blockedFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['DataMatrix' as const, 'clean data matrix'],
    ['QRCode' as const, 'clean qr']
  ])('decodes a clean %s fixture', async (format, payload) => {
    const result = await decodeBarcodes(await pngFor(payload, format))
    expect(result).toMatchObject({
      status: 'found',
      barcode: { text: payload, format, symbology: format }
    })
    if (result.status === 'found') {
      expect(result.barcode.position.topLeft).toEqual({
        x: expect.any(Number),
        y: expect.any(Number)
      })
    }
  })

  it('decodes rotated and inverted fixtures', async () => {
    const rotated = await decodeBarcodes(
      rotateClockwise(await pngFor('rotated matrix', 'DataMatrix'))
    )
    const inverted = await decodeBarcodes(invert(await pngFor('inverted qr', 'QRCode')))

    expect(rotated).toMatchObject({ status: 'found', barcode: { text: 'rotated matrix' } })
    expect(inverted).toMatchObject({ status: 'found', barcode: { text: 'inverted qr' } })
  })

  it('distinguishes no symbol from more than one symbol', async () => {
    const blank = new PNG({ width: 160, height: 120, fill: true })
    blank.data.fill(255)
    const none = await decodeBarcodes(PNG.sync.write(blank))

    const multiple = await decodeBarcodes(
      combine(await pngFor('matrix', 'DataMatrix'), await pngFor('qr', 'QRCode'))
    )

    expect(none).toEqual({ status: 'not-found' })
    expect(multiple).toMatchObject({ status: 'multiple' })
    if (multiple.status === 'multiple') {
      expect(multiple.barcodes.map((barcode) => barcode.text).sort()).toEqual(['matrix', 'qr'])
    }
  })

  it('preserves an opaque Base64 payload containing +, /, and trailing =', async () => {
    const payload = '+/8='
    const result = await decodeBarcodes(await pngFor(payload, 'DataMatrix'))
    expect(result).toMatchObject({ status: 'found', barcode: { text: payload } })
  })

  it('preserves an exact 200-character Data Matrix payload', async () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const payload = Array.from(
      { length: 200 },
      (_, index) => alphabet[index % alphabet.length]
    ).join('')
    const result = await decodeBarcodes(await pngFor(payload, 'DataMatrix'))

    expect(payload).toHaveLength(200)
    expect(result).toMatchObject({ status: 'found', barcode: { text: payload } })
  })
})

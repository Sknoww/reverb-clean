import { readFileSync } from 'node:fs'
import { prepareZXingModule, readBarcodes, type Position, type ReadResult } from 'zxing-wasm/reader'

export interface DecodedBarcode {
  text: string
  format: string
  symbology: string
  position: Position
}

export type BarcodeDecodeResult =
  | { status: 'not-found' }
  | { status: 'found'; barcode: DecodedBarcode }
  | { status: 'multiple'; barcodes: DecodedBarcode[] }
  | { status: 'error'; error: 'decode-failed' }

/** Resolve through the package export so the development and packaged layouts use the same file. */
export const resolveBarcodeWasmPath = (): string =>
  require.resolve('zxing-wasm/reader/zxing_reader.wasm')

let decoderReady: Promise<void> | undefined

/** ZXing's default is a CDN URL. Supplying wasmBinary keeps every decode offline. */
const prepareDecoder = (): Promise<void> => {
  if (!decoderReady) {
    const wasmBytes = Uint8Array.from(readFileSync(resolveBarcodeWasmPath()))
    decoderReady = prepareZXingModule({
      overrides: { wasmBinary: wasmBytes.buffer },
      fireImmediately: true
    }).then(() => undefined)
  }

  return decoderReady
}

const toDecodedBarcode = (result: ReadResult): DecodedBarcode => ({
  text: result.text,
  format: result.format,
  symbology: result.symbology,
  position: result.position
})

/** Decode encoded image bytes without capture, persistence, or network access. */
export const decodeBarcodes = async (
  imageBytes: Uint8Array | ArrayBuffer
): Promise<BarcodeDecodeResult> => {
  try {
    await prepareDecoder()
    const results = await readBarcodes(imageBytes, {
      formats: ['DataMatrix', 'QRCode'],
      maxNumberOfSymbols: 0,
      tryHarder: true,
      tryRotate: true,
      tryInvert: true
    })
    const barcodes = results.filter((result) => result.isValid).map(toDecodedBarcode)

    if (barcodes.length === 0) return { status: 'not-found' }
    if (barcodes.length === 1) return { status: 'found', barcode: barcodes[0] }
    return { status: 'multiple', barcodes }
  } catch {
    // Image bytes and any text recovered before a decoder failure are deliberately omitted.
    return { status: 'error', error: 'decode-failed' }
  }
}

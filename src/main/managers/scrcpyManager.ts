import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { promisify } from 'util'
import { Adb, AdbServerClient } from '@yume-chan/adb'
import { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy'
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp'
import {
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidKeyEventMeta,
  AndroidMotionEventAction,
  AndroidMotionEventButton,
  ScrcpyCodecOptions,
  ScrcpyControlMessageWriter
} from '@yume-chan/scrcpy'
import { Consumable, ReadableStream } from '@yume-chan/stream-extra'
import logger from '../logger'
import { getAdbPath, getBundledScrcpyServerPath } from '../utils/adbUtils'
import { loadConfig } from './configManager'
import { ScrcpyPacket, ScrcpyState } from '../types'

const run = promisify(execFile)

const REMOTE_JAR = '/data/local/tmp/scrcpy-server.jar'
const ADB_SERVER_PORT = 5037

interface Session {
  deviceId: string
  adb: Adb
  client?: AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>>
  controller?: ScrcpyControlMessageWriter
  stopping: boolean
}

let onState: ((state: ScrcpyState) => void) | null = null
let onPacket: ((packet: ScrcpyPacket) => void) | null = null
let session: Session | undefined
let state: ScrcpyState = { running: false }

export const setScrcpyListeners = (
  stateListener: ((state: ScrcpyState) => void) | null,
  packetListener: ((packet: ScrcpyPacket) => void) | null
): void => {
  onState = stateListener
  onPacket = packetListener
}

const publish = (next: ScrcpyState): void => {
  state = next
  onState?.(state)
}

export const getScrcpyState = (): ScrcpyState => state

const FAILURE_LOG_INTERVAL_MS = 5000
const lastFailureLog = new Map<string, number>()

function reportFailure(operation: string, failed: Session, error: unknown): void {
  if (failed.stopping) return
  const now = Date.now()
  if (now - (lastFailureLog.get(operation) ?? -Infinity) < FAILURE_LOG_INTERVAL_MS) return
  lastFailureLog.set(operation, now)
  logger.warn('scrcpy control request failed', { operation, deviceId: failed.deviceId, error })
}

export const requestKeyframe = (): void => {
  const current = session
  current?.controller
    ?.resetVideo()
    .catch((error: unknown) => reportFailure('resetVideo', current, error))
}

const control = (
  operation: string,
  send: (writer: ScrcpyControlMessageWriter) => Promise<void>
): void => {
  const current = session
  const writer = current?.controller
  if (current && writer) {
    send(writer).catch((error: unknown) => reportFailure(operation, current, error))
  }
}

const finite = (...values: number[]): boolean => values.every(Number.isFinite)

export function sendTouch(
  action: 'down' | 'move' | 'up',
  x: number,
  y: number,
  videoWidth: number,
  videoHeight: number
): void {
  if (!finite(x, y, videoWidth, videoHeight) || videoWidth <= 0 || videoHeight <= 0) return
  const pressed = action !== 'up'
  control('injectTouch', (writer) =>
    writer.injectTouch({
      action: {
        down: AndroidMotionEventAction.Down,
        move: AndroidMotionEventAction.Move,
        up: AndroidMotionEventAction.Up
      }[action],
      pointerId: 0n,
      pointerX: Math.round(x),
      pointerY: Math.round(y),
      videoWidth,
      videoHeight,
      pressure: pressed ? 1 : 0,
      actionButton: pressed ? AndroidMotionEventButton.Primary : AndroidMotionEventButton.None,
      buttons: pressed ? AndroidMotionEventButton.Primary : AndroidMotionEventButton.None
    })
  )
}

export function sendScroll(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
  videoWidth: number,
  videoHeight: number
): void {
  if (!finite(x, y, deltaX, deltaY, videoWidth, videoHeight)) return
  if (videoWidth <= 0 || videoHeight <= 0) return
  // Browser wheel deltas point down-positive; scrcpy scrolls up-positive in [-1, 1].
  const clamp = (value: number): number => Math.max(-1, Math.min(1, -value / 120))
  control('injectScroll', (writer) =>
    writer.injectScroll({
      pointerX: Math.round(x),
      pointerY: Math.round(y),
      videoWidth,
      videoHeight,
      scrollX: clamp(deltaX),
      scrollY: clamp(deltaY),
      buttons: 0
    })
  )
}

export function sendKey(action: 'down' | 'up', code: string, metaState: number): void {
  const keyCode = AndroidKeyCode[code as keyof typeof AndroidKeyCode]
  if (keyCode === undefined || !finite(metaState)) return
  control('injectKeyCode', (writer) =>
    writer.injectKeyCode({
      action: action === 'down' ? AndroidKeyEventAction.Down : AndroidKeyEventAction.Up,
      keyCode,
      repeat: 0,
      metaState: metaState as AndroidKeyEventMeta
    })
  )
}

export function sendNav(button: 'back' | 'home'): void {
  const keyCode = button === 'back' ? AndroidKeyCode.AndroidBack : AndroidKeyCode.AndroidHome
  for (const action of [AndroidKeyEventAction.Down, AndroidKeyEventAction.Up]) {
    control('injectKeyCode', (writer) =>
      writer.injectKeyCode({ action, keyCode, repeat: 0, metaState: 0 })
    )
  }
}

async function teardown(current: Session, error?: string): Promise<void> {
  if (current.stopping) return
  current.stopping = true
  if (session === current) {
    session = undefined
    publish({ running: false, error })
  }
  await current.client?.close().catch(() => undefined)
  await current.adb.close().catch(() => undefined)
}

export const stopScrcpy = (): void => {
  if (session) void teardown(session)
}

// Restarting the encoder can rewind its timestamps, and the decoder rejects backwards ones.
function makePtsRebaser(): (pts: bigint | undefined) => number {
  let base: number | null = null
  let last = 0
  return (pts) => {
    if (pts === undefined) return (last += 1000)
    const micros = Number(pts)
    if (base === null || micros < base) base = micros - last
    const rebased = micros - base
    last = rebased > last ? rebased : last + 1
    return last
  }
}

async function pumpVideo(current: Session, stream: ReadableStream<unknown>): Promise<void> {
  const rebase = makePtsRebaser()
  const reader = (stream as ReadableStream<ScrcpyMediaPacket>).getReader()
  try {
    while (!current.stopping) {
      const { done, value } = await reader.read()
      if (done || !value) break
      if (!value.data?.length) continue
      const data = new Uint8Array(value.data)
      onPacket?.(
        value.type === 'configuration'
          ? { type: 'config', data }
          : { type: 'frame', data, keyframe: value.keyframe === true, pts: rebase(value.pts) }
      )
    }
  } catch (error) {
    if (!current.stopping) logger.error('scrcpy video stream failed', { error })
  } finally {
    reader.releaseLock()
  }
}

interface ScrcpyMediaPacket {
  type: 'configuration' | 'data'
  data: Uint8Array
  keyframe?: boolean
  pts?: bigint
}

let starting: Promise<ScrcpyState> | undefined

export function startScrcpy(deviceId: string): Promise<ScrcpyState> {
  if (session) return Promise.resolve(state)
  if (starting) return starting
  if (!deviceId) return Promise.resolve({ running: false, error: 'No device selected' })
  const attempt = launch(deviceId).finally(() => {
    if (starting === attempt) starting = undefined
  })
  starting = attempt
  return attempt
}

async function launch(deviceId: string): Promise<ScrcpyState> {
  let current: Session | undefined
  try {
    await run(getAdbPath(loadConfig().adbPath), ['start-server'], { timeout: 10000 })
    const serverClient = new AdbServerClient(
      new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: ADB_SERVER_PORT })
    )
    const device = (await serverClient.getDevices()).find(
      (candidate) => candidate.serial === deviceId && candidate.state === 'device'
    )
    if (!device) throw new Error('Device is not connected or not authorized')

    const adb = await serverClient.createAdb(device)
    current = { deviceId, adb, stopping: false }
    session = current
    const active = current

    const jar = new Uint8Array(await readFile(getBundledScrcpyServerPath()))
    await AdbScrcpyClient.pushServer(
      adb,
      new ReadableStream<Consumable<Uint8Array>>({
        start(controller) {
          controller.enqueue(new Consumable(jar))
          controller.close()
        }
      })
    )

    const options = new AdbScrcpyOptions3_3_3({
      video: true,
      audio: false,
      control: true,
      cleanup: true,
      maxSize: 1280,
      maxFps: 30,
      videoBitRate: 4_000_000,
      videoCodec: 'h264',
      tunnelForward: false,
      sendDeviceMeta: true,
      sendFrameMeta: true,
      sendDummyByte: true,
      sendCodecMeta: true,
      videoCodecOptions: new ScrcpyCodecOptions({ maxBframes: 0 })
    })
    const client = await AdbScrcpyClient.start(adb, REMOTE_JAR, options)
    active.client = client
    if (active.stopping) {
      await client.close().catch(() => undefined)
      throw new Error('Mirroring was stopped while starting')
    }
    active.controller = client.controller

    const video = await client.videoStream
    if (!video) throw new Error('scrcpy did not provide a video stream')
    void pumpVideo(active, video.stream)

    void client.exited.then(
      () => teardown(active),
      () => teardown(active, 'scrcpy exited unexpectedly')
    )
    void adb.disconnected.then(() => teardown(active, 'Device disconnected'))

    logger.info('scrcpy mirror started', { deviceId })
    publish({ running: true, deviceId })
    return state
  } catch (error) {
    const message = (error as Error).message
    logger.error('scrcpy mirror failed to start', { error })
    if (current) await teardown(current, message)
    else publish({ running: false, error: message })
    return state
  }
}

import fs from 'fs'
import path from 'path'
import { isMap, isScalar, isSeq, parseDocument, Scalar, YAMLMap, YAMLSeq } from 'yaml'
import logger from '../logger'
import {
  SyncApplyResult,
  SyncEntry,
  SyncEntryStatus,
  SyncPlan,
  SyncPlanItem,
  SyncPlanResult,
  SyncScanResult
} from '../types'
import { loadConfig } from './configManager'

const deploymentSegments = (deploymentPath: string): string[] =>
  deploymentPath.split('.').filter(Boolean)

interface DeploymentEntry {
  zone: string
  filePath: string
  fileName: string
  repeatable?: boolean
}

const composeLocalPath = (connectorRoot: string, repoRelativePath: string): string => {
  const root = connectorRoot.replace(/\\/g, '/').replace(/\/+$/, '')
  const rel = repoRelativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return `${root}/${rel}`
}

const baseNameOf = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

const samePath = (a: string, b: string): boolean => a.replace(/\\/g, '/') === b.replace(/\\/g, '/')

interface ParsedVersion {
  date: string
  revision: number | null
}

const parseVersion = (fileName: string): ParsedVersion | null => {
  const stem = fileName.replace(/\.[^./]*$/, '')
  const match = /_(\d{4})_(\d{2})_(\d{2})(?:_(\d+))?$/.exec(stem)
  if (!match) return null

  const [, year, month, day, revision] = match
  const monthNum = Number(month)
  const dayNum = Number(day)
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null

  return {
    date: `${year}-${month}-${day}`,
    revision: revision === undefined ? null : Number(revision)
  }
}

const directorySegments = (filePath: string): string[] =>
  filePath.replace(/\\/g, '/').split('/').filter(Boolean).slice(0, -1)

const sharedPrefixLength = (segmentLists: string[][]): number => {
  if (segmentLists.length === 0) return 0

  let depth = 0
  for (;;) {
    const segment = segmentLists[0][depth]
    if (segment === undefined) return depth

    const shared = segmentLists.every((list) => list.length > depth + 1 && list[depth] === segment)
    if (!shared) return depth
    depth++
  }
}

const groupDepth = (segmentLists: string[][]): number => {
  if (segmentLists.length === 0) return 0

  const byRoot = new Map<string, string[][]>()
  for (const list of segmentLists) {
    const root = list[0] ?? ''
    const bucket = byRoot.get(root)
    if (bucket) bucket.push(list)
    else byRoot.set(root, [list])
  }

  let depth = Number.POSITIVE_INFINITY
  for (const lists of byRoot.values()) depth = Math.min(depth, sharedPrefixLength(lists))
  return Number.isFinite(depth) ? depth : 0
}

const readDeploymentSeq = (
  raw: string,
  label: string,
  deploymentPath: string
): { seq: YAMLSeq; doc: ReturnType<typeof parseDocument> } => {
  const doc = parseDocument(raw)
  if (doc.errors.length > 0) {
    throw new Error(`${label} is not valid YAML: ${doc.errors[0].message}`)
  }

  const seq = doc.getIn(deploymentSegments(deploymentPath))
  if (!isSeq(seq)) {
    throw new Error(`${label} has no ${deploymentPath} list`)
  }

  return { seq, doc }
}

const entriesFromSeq = (seq: YAMLSeq): DeploymentEntry[] => {
  const entries: DeploymentEntry[] = []

  for (const item of seq.items) {
    if (!isMap(item)) continue

    const zone = item.get('zone')
    const filePath = item.get('filePath')
    if (typeof zone !== 'string' || typeof filePath !== 'string') continue

    const repeatable = item.get('repeatable')
    entries.push({
      zone,
      filePath,
      fileName: baseNameOf(filePath),
      ...(typeof repeatable === 'boolean' ? { repeatable } : {})
    })
  }

  return entries
}

const readSourceEntries = (sourceFile: string, deploymentPath: string): DeploymentEntry[] => {
  const raw = fs.readFileSync(sourceFile, 'utf-8')
  return entriesFromSeq(readDeploymentSeq(raw, 'The source file', deploymentPath).seq)
}

export const readGitBranch = (connectorRoot: string): string | null => {
  try {
    if (!connectorRoot) return null

    let gitDir = path.join(connectorRoot, '.git')
    const stat = fs.statSync(gitDir)

    if (stat.isFile()) {
      const pointer = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(gitDir, 'utf-8'))
      if (!pointer) return null
      const target = pointer[1].trim()
      gitDir = path.isAbsolute(target) ? target : path.resolve(connectorRoot, target)
    }

    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf-8').trim()

    const branch = /^ref:\s*refs\/heads\/(.+)$/.exec(head)
    if (branch) return branch[1]

    if (/^[0-9a-f]{7,40}$/i.test(head)) return head.slice(0, 7)

    return null
  } catch {
    return null
  }
}

interface ResolvedPaths {
  connectorRoot: string
  sourceFile: string
  targetFile: string
  deploymentPath: string
}

const resolvePaths = (): ResolvedPaths => {
  const config = loadConfig()
  return {
    connectorRoot: config.connectorRoot ?? '',
    sourceFile: config.sync?.sourceFile ?? '',
    targetFile: config.sync?.targetFile ?? '',
    deploymentPath: config.sync?.deploymentPath ?? ''
  }
}

const missingPathError = ({
  connectorRoot,
  sourceFile,
  targetFile,
  deploymentPath
}: ResolvedPaths): string | null => {
  const missing: string[] = []
  if (!connectorRoot) missing.push('base path')
  if (!sourceFile) missing.push('source file')
  if (!targetFile) missing.push('target file')
  if (!deploymentPath) missing.push('deployment key')
  return missing.length > 0 ? `Set the ${missing.join(', ')} to scan.` : null
}

export const scanSync = async (): Promise<SyncScanResult> => {
  const paths = resolvePaths()
  const base: SyncScanResult = {
    ok: false,
    entries: [],
    branch: readGitBranch(paths.connectorRoot),
    ...paths
  }

  const pathError = missingPathError(paths)
  if (pathError) return { ...base, error: pathError }

  let sourceEntries: DeploymentEntry[]
  let targetEntries: DeploymentEntry[]

  try {
    // The source file is read-only; Sync writes only to the target.
    sourceEntries = readSourceEntries(paths.sourceFile, paths.deploymentPath)
  } catch (error: any) {
    logger.error('Sync scan failed reading source:', error.message)
    return { ...base, error: `Could not read the source file — ${error.message}` }
  }

  try {
    const raw = fs.readFileSync(paths.targetFile, 'utf-8')
    targetEntries = entriesFromSeq(
      readDeploymentSeq(raw, 'The target file', paths.deploymentPath).seq
    )
  } catch (error: any) {
    logger.error('Sync scan failed reading target:', error.message)
    return { ...base, error: `Could not read the target file — ${error.message}` }
  }

  const targetByZone = new Map(targetEntries.map((entry) => [entry.zone, entry]))
  const prefixDepth = groupDepth(sourceEntries.map((e) => directorySegments(e.filePath)))

  const entries: SyncEntry[] = sourceEntries.map((source) => {
    const target = targetByZone.get(source.zone)
    const localPath = composeLocalPath(paths.connectorRoot, source.filePath)

    let status: SyncEntryStatus = 'available'
    if (target) status = samePath(target.filePath, localPath) ? 'current' : 'outOfDate'

    const sourceVersion = parseVersion(source.fileName)
    const targetVersion = target ? parseVersion(target.fileName) : null

    return {
      zone: source.zone,
      status,
      group: directorySegments(source.filePath)[prefixDepth] ?? null,
      inTarget: Boolean(target),
      localPath,
      fileMissing: !fs.existsSync(localPath),
      sourceFileName: source.fileName,
      sourceVersion: sourceVersion?.date ?? null,
      sourceRevision: sourceVersion?.revision ?? null,
      targetFileName: target?.fileName ?? null,
      targetVersion: targetVersion?.date ?? null,
      targetRevision: targetVersion?.revision ?? null,
      ...(source.repeatable !== undefined ? { repeatable: source.repeatable } : {})
    }
  })

  const sourceZones = new Set(sourceEntries.map((entry) => entry.zone))
  for (const target of targetEntries) {
    if (sourceZones.has(target.zone)) continue

    const targetVersion = parseVersion(target.fileName)
    entries.push({
      zone: target.zone,
      status: 'orphan',
      group: null,
      inTarget: true,
      localPath: target.filePath,
      fileMissing: !fs.existsSync(target.filePath),
      sourceFileName: null,
      sourceVersion: null,
      sourceRevision: null,
      targetFileName: target.fileName,
      targetVersion: targetVersion?.date ?? null,
      targetRevision: targetVersion?.revision ?? null
    })
  }

  logger.info(`Sync scan: ${entries.length} zones (${targetEntries.length} in target)`)
  return { ...base, ok: true, entries }
}

const buildPlan = (
  zones: string[],
  sourceEntries: DeploymentEntry[],
  targetEntries: DeploymentEntry[],
  paths: ResolvedPaths
): SyncPlan => {
  const selected = new Set(zones)
  const sourceByZone = new Map(sourceEntries.map((entry) => [entry.zone, entry]))
  const targetByZone = new Map(targetEntries.map((entry) => [entry.zone, entry]))

  const adds: SyncPlanItem[] = []
  const removes: SyncPlanItem[] = []
  const bumps: SyncPlanItem[] = []
  let unchanged = 0

  for (const target of targetEntries) {
    if (!selected.has(target.zone)) {
      removes.push({
        zone: target.zone,
        fromFileName: target.fileName,
        toFileName: null,
        localPath: target.filePath
      })
      continue
    }

    const source = sourceByZone.get(target.zone)

    if (!source) {
      unchanged++
      continue
    }

    const localPath = composeLocalPath(paths.connectorRoot, source.filePath)
    if (samePath(target.filePath, localPath)) {
      unchanged++
      continue
    }

    bumps.push({
      zone: target.zone,
      fromFileName: target.fileName,
      toFileName: source.fileName,
      localPath
    })
  }

  for (const zone of selected) {
    if (targetByZone.has(zone)) continue

    const source = sourceByZone.get(zone)

    if (!source) continue

    adds.push({
      zone,
      fromFileName: null,
      toFileName: source.fileName,
      localPath: composeLocalPath(paths.connectorRoot, source.filePath)
    })
  }

  return {
    adds,
    removes,
    bumps,
    unchanged,
    targetFile: paths.targetFile,
    backupKeep: BACKUP_KEEP,
    branch: readGitBranch(paths.connectorRoot)
  }
}

const quoteStyleOf = (seq: YAMLSeq, key: string): Scalar.Type | undefined => {
  for (const item of seq.items) {
    if (!isMap(item)) continue
    const node = item.get(key, true)
    if (isScalar(node) && typeof node.value === 'string') return node.type
  }
  return undefined
}

const setScalarType = (map: YAMLMap, key: string, type: Scalar.Type | undefined): void => {
  const node = map.get(key, true)
  if (isScalar(node)) node.type = type ?? 'QUOTE_DOUBLE'
}

const rewriteTarget = (
  raw: string,
  plan: SyncPlan,
  sourceByZone: Map<string, DeploymentEntry>,
  deploymentPath: string
): string => {
  const { doc, seq } = readDeploymentSeq(raw, 'The target file', deploymentPath)

  // New entries should follow the target file's existing quoting and spacing.
  const zoneStyle = quoteStyleOf(seq, 'zone')
  const pathStyle = quoteStyleOf(seq, 'filePath')

  const spaced = seq.items.some((item) => isMap(item) && item.spaceBefore === true)

  const bumpByZone = new Map(plan.bumps.map((item) => [item.zone, item]))
  for (const item of seq.items) {
    if (!isMap(item)) continue

    const zone = item.get('zone')
    const bump = typeof zone === 'string' ? bumpByZone.get(zone) : undefined
    if (!bump) continue

    const node = item.get('filePath', true)
    if (isScalar(node)) {
      // Mutating the scalar preserves its style and trailing YAML comments.
      node.value = bump.localPath
    } else {
      item.set('filePath', bump.localPath)
    }
  }

  const removed = new Set(plan.removes.map((item) => item.zone))
  // Remove back-to-front so earlier indexes remain valid.
  for (let i = seq.items.length - 1; i >= 0; i--) {
    const item = seq.items[i]
    if (!isMap(item)) continue

    const zone = item.get('zone')
    if (typeof zone === 'string' && removed.has(zone)) seq.items.splice(i, 1)
  }

  // Append new entries without disturbing the target's existing order.
  for (const add of plan.adds) {
    const source = sourceByZone.get(add.zone)
    if (!source) continue

    const node = doc.createNode({ zone: add.zone, filePath: add.localPath }) as YAMLMap
    setScalarType(node, 'zone', zoneStyle)
    setScalarType(node, 'filePath', pathStyle)

    // Omit false to avoid churning files that never included the optional key.
    if (source.repeatable === true) node.set('repeatable', true)
    if (spaced) node.spaceBefore = true

    seq.add(node)
  }

  if (seq.items.length > 0) {
    seq.flow = false
    for (const item of seq.items) {
      if (isMap(item)) item.flow = false
    }
  }

  // Deployment paths must stay on one line.
  return doc.toString({ lineWidth: 0 })
}

const BACKUP_KEEP = 5

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const backupNamePattern = (targetFile: string): RegExp =>
  new RegExp(
    `^${escapeRegExp(path.basename(targetFile))}\\.(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2})(?:-(\\d+))?\\.bak$`
  )

interface BackupFile {
  fileName: string
  stamp: string
  seq: number
}

const listBackups = (targetFile: string): BackupFile[] => {
  const pattern = backupNamePattern(targetFile)
  try {
    return fs
      .readdirSync(path.dirname(targetFile))
      .map((fileName) => {
        const match = pattern.exec(fileName)
        if (!match) return null
        return { fileName, stamp: match[1], seq: match[2] === undefined ? 0 : Number(match[2]) }
      })
      .filter((entry): entry is BackupFile => entry !== null)
      .sort((a, b) => (a.stamp === b.stamp ? b.seq - a.seq : b.stamp.localeCompare(a.stamp)))
  } catch {
    return []
  }
}

const rotateBackups = (targetFile: string): string => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  const nameFor = (seq: number): string =>
    seq === 0 ? `${targetFile}.${stamp}.bak` : `${targetFile}.${stamp}-${seq}.bak`

  const existing = listBackups(targetFile)

  let seq = existing.reduce(
    (max, entry) => (entry.stamp === stamp ? Math.max(max, entry.seq + 1) : max),
    0
  )
  let backupFile = nameFor(seq)
  while (fs.existsSync(backupFile)) backupFile = nameFor(++seq)

  fs.copyFileSync(targetFile, backupFile)

  const dir = path.dirname(targetFile)
  for (const stale of listBackups(targetFile).slice(BACKUP_KEEP)) {
    try {
      fs.unlinkSync(path.join(dir, stale.fileName))
    } catch {
      // A locked old backup must not fail the apply.
    }
  }

  return backupFile
}

const writeTargetSafely = (targetFile: string, contents: string): string => {
  const tempFile = `${targetFile}.tmp`
  // The target is not versioned, so keep a backup and replace it atomically.
  const backupFile = rotateBackups(targetFile)

  try {
    fs.writeFileSync(tempFile, contents, 'utf-8')
    fs.renameSync(tempFile, targetFile)
  } catch (error) {
    try {
      fs.unlinkSync(tempFile)
    } catch {}
    throw error
  }

  return backupFile
}

const loadBothSides = (
  paths: ResolvedPaths
): { source: DeploymentEntry[]; target: DeploymentEntry[]; raw: string } => {
  const source = readSourceEntries(paths.sourceFile, paths.deploymentPath)
  const raw = fs.readFileSync(paths.targetFile, 'utf-8')
  const target = entriesFromSeq(readDeploymentSeq(raw, 'The target file', paths.deploymentPath).seq)
  return { source, target, raw }
}

export const planSync = async (zones: string[]): Promise<SyncPlanResult> => {
  // Planning is preview-only; applySync owns every write.
  const paths = resolvePaths()

  const pathError = missingPathError(paths)
  if (pathError) return { ok: false, error: pathError }

  try {
    const { source, target } = loadBothSides(paths)
    return { ok: true, plan: buildPlan(zones, source, target, paths) }
  } catch (error: any) {
    logger.error('Sync plan failed:', error.message)
    return { ok: false, error: error.message }
  }
}

export const applySync = async (zones: string[]): Promise<SyncApplyResult> => {
  const paths = resolvePaths()

  const pathError = missingPathError(paths)
  if (pathError) return { success: false, error: pathError }

  try {
    const { source, target, raw } = loadBothSides(paths)
    const plan = buildPlan(zones, source, target, paths)

    if (plan.adds.length === 0 && plan.removes.length === 0 && plan.bumps.length === 0) {
      logger.info('Sync apply: nothing to do')
      return { success: true, plan }
    }

    const sourceByZone = new Map(source.map((entry) => [entry.zone, entry]))
    const contents = rewriteTarget(raw, plan, sourceByZone, paths.deploymentPath)
    const backupFile = writeTargetSafely(paths.targetFile, contents)

    logger.info(
      `Sync apply: +${plan.adds.length} -${plan.removes.length} ~${plan.bumps.length} → ${paths.targetFile}`
    )
    return { success: true, plan, backupFile }
  } catch (error: any) {
    logger.error('Sync apply failed:', error.message)
    return { success: false, error: error.message }
  }
}

export const getSyncBranch = async (): Promise<string | null> =>
  readGitBranch(resolvePaths().connectorRoot)

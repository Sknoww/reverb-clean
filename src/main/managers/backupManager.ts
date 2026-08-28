import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import logger from '../logger'
import { BundleProject, BundleResult, Config, Project, ReverbBundle } from '../types'
import { loadConfig, replaceConfig } from './configManager'
import { selectBundleFile, selectBundleSavePath } from './dialogManager'
import { saveProject } from './projectManager'

// Export / import bundle (area 17) The fresh-machine restore story, and — once area 19 lands — the thing that carries the target values...

const BUNDLE_FORMAT = 'reverb-bundle'
const BUNDLE_VERSION = 1

/** `reverb-backup-2026-07-27.json` */
const defaultBundleName = (): string => {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')

  return `reverb-backup-${stamp}.json`
}

const isProject = (value: any): value is Project =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof value.id === 'string' &&
  typeof value.name === 'string'

/** Every `*.project.json` under `saveLocation`. */
const readAllProjectFiles = (projectsDir: string): BundleProject[] => {
  if (!projectsDir || !fs.existsSync(projectsDir)) {
    logger.warn('No projects directory to export:', projectsDir)
    return []
  }

  const bundled: BundleProject[] = []

  for (const fileName of fs.readdirSync(projectsDir)) {
    if (!fileName.endsWith('.project.json')) continue

    try {
      const project = JSON.parse(fs.readFileSync(path.join(projectsDir, fileName), 'utf-8'))
      if (!isProject(project)) {
        logger.warn('Skipping unrecognised project file:', fileName)
        continue
      }
      bundled.push({ fileName, project })
    } catch (error) {
      logger.error(`Failed to read project file ${fileName}:`, error)
    }
  }

  return bundled
}

/** Shape check only — the *contents* are re-validated downstream by `validateAndFillConfig` (config) and `saveProject` (projects), so a... */
const parseBundle = (raw: string): ReverbBundle => {
  const parsed = JSON.parse(raw)

  if (!parsed || typeof parsed !== 'object') throw new Error('Not a JSON object')
  if (parsed.format !== BUNDLE_FORMAT) throw new Error('Not a Reverb backup file')
  if (parsed.version !== BUNDLE_VERSION) {
    throw new Error(
      `Unsupported backup version ${parsed.version} (this build reads ${BUNDLE_VERSION})`
    )
  }
  if (!parsed.config || typeof parsed.config !== 'object') throw new Error('Backup has no config')

  return {
    ...parsed,
    projects: Array.isArray(parsed.projects)
      ? parsed.projects.filter((p: any) => isProject(p?.project))
      : []
  }
}

/** Write config + every project under `saveLocation` to a file the user picks. */
export const exportBundle = async (): Promise<BundleResult> => {
  try {
    const filePath = await selectBundleSavePath(defaultBundleName())
    if (!filePath) return { success: false, filePath: null, projectCount: 0 }

    const config = loadConfig()
    const projects = readAllProjectFiles(config.saveLocation)

    const bundle: ReverbBundle = {
      format: BUNDLE_FORMAT,
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      config,
      projects
    }

    fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8')
    logger.info(`Exported bundle to ${filePath} (${projects.length} projects)`)

    return { success: true, filePath, projectCount: projects.length }
  } catch (error: any) {
    logger.error('Failed to export bundle:', error)
    return { success: false, filePath: null, projectCount: 0, error: error.message }
  }
}

/** Replace config and write every project the bundle carries. */
export const importBundle = async (): Promise<BundleResult> => {
  try {
    const filePath = await selectBundleFile()
    if (!filePath) return { success: false, filePath: null, projectCount: 0 }

    const bundle = parseBundle(fs.readFileSync(filePath, 'utf-8'))

    // Config first: it carries `saveLocation`, and writing it re-points projectManager's directory (via `setProjectsDirectory`) before any...
    const applied = await replaceConfig(bundle.config as Config)
    if (!applied) throw new Error('Could not write the imported config')

    let projectCount = 0
    for (const entry of bundle.projects) {
      try {
        saveProject(entry.project)
        projectCount++
      } catch (error) {
        logger.error(`Failed to import project ${entry.fileName}:`, error)
      }
    }

    logger.info(`Imported bundle from ${filePath} (${projectCount} projects)`)
    return { success: true, filePath, projectCount }
  } catch (error: any) {
    logger.error('Failed to import bundle:', error)
    return { success: false, filePath: null, projectCount: 0, error: error.message }
  }
}

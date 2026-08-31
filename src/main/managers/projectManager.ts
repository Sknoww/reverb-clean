import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import logger from '../logger'
import { AdbCommand, Flow, Project } from '../types'

let projectsDir = path.join(app.getPath('userData'), 'projects')

export const setProjectsDirectory = (directory: string): void => {
  projectsDir = directory

  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true })
  }
}

if (!fs.existsSync(projectsDir)) {
  fs.mkdirSync(projectsDir, { recursive: true })
}

const validateAndMigrateCommand = (command: any): AdbCommand | null => {
  if (!command || typeof command !== 'object') {
    logger.warn('Invalid command object:', command)
    return null
  }

  if (!command.name || !command.keyword || !command.type || command.value === undefined) {
    logger.warn('Command missing required fields:', command)
    return null
  }

  return {
    id: command.id || `${command.keyword}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: command.name,
    keyword: command.keyword,
    type: command.type,
    value: command.value,
    description: command.description || ''
  }
}

const validateAndMigrateFlow = (flow: any): Flow | null => {
  if (!flow || typeof flow !== 'object') {
    logger.warn('Invalid flow object:', flow)
    return null
  }

  if (!flow.id || !flow.name || !Array.isArray(flow.commands)) {
    logger.warn('Flow missing required fields:', flow)
    return null
  }

  const migratedCommands = flow.commands
    .map(validateAndMigrateCommand)
    .filter((cmd: AdbCommand | null): cmd is AdbCommand => cmd !== null)

  return {
    id: flow.id,
    name: flow.name,
    description: flow.description || '',
    commands: migratedCommands,
    delay: typeof flow.delay === 'number' ? flow.delay : 1000
  }
}

const validateAndMigrateProject = (projectData: any): Project | null => {
  if (!projectData || typeof projectData !== 'object') {
    logger.error('Invalid project data')
    return null
  }

  if (!projectData.id || !projectData.name) {
    logger.error('Project missing required fields (id, name)')
    return null
  }

  const commands = Array.isArray(projectData.commands) ? projectData.commands : []
  const flows = Array.isArray(projectData.flows) ? projectData.flows : []

  const migratedCommands = commands
    .map(validateAndMigrateCommand)
    .filter((cmd: AdbCommand | null): cmd is AdbCommand => cmd !== null)

  const migratedFlows = flows
    .map(validateAndMigrateFlow)
    .filter((flow: Flow | null): flow is Flow => flow !== null)

  return {
    id: projectData.id,
    name: projectData.name,
    description: projectData.description || '',
    createdAt: projectData.createdAt || new Date().toISOString(),
    updatedAt: projectData.updatedAt || new Date().toISOString(),
    commands: migratedCommands,
    flows: migratedFlows
  }
}

export const saveProject = (project: Project): void => {
  logger.info('Saving project:', project)
  const filePath = path.join(projectsDir, `${project.id}.project.json`)
  fs.writeFileSync(filePath, JSON.stringify(project, null, 2))
}

export const getProject = (projectId: string): Project | null => {
  logger.info('Getting project:', projectId)
  logger.info('Projects dir:', projectsDir)
  const filePath = path.join(projectsDir, projectId)

  if (!fs.existsSync(filePath)) {
    logger.warn('Project file does not exist:', filePath)
    return null
  }

  logger.info('Project file path:', filePath)

  try {
    const projectData = fs.readFileSync(filePath, 'utf-8')

    if (!projectData.trim()) {
      logger.error('Project file is empty:', filePath)
      return null
    }

    let parsedData: any
    try {
      parsedData = JSON.parse(projectData)
    } catch (parseError) {
      logger.error('Failed to parse project JSON:', parseError)

      try {
        const backupPath = filePath + '.corrupted.' + Date.now()
        fs.copyFileSync(filePath, backupPath)
        logger.info('Backed up corrupted project to:', backupPath)
      } catch (backupError) {
        logger.error('Failed to backup corrupted project:', backupError)
      }

      return null
    }

    const validatedProject = validateAndMigrateProject(parsedData)

    if (!validatedProject) {
      logger.error('Project validation failed for:', filePath)
      return null
    }

    if (JSON.stringify(parsedData) !== JSON.stringify(validatedProject)) {
      logger.info('Project schema migrated, saving updated version')
      try {
        fs.writeFileSync(filePath, JSON.stringify(validatedProject, null, 2), 'utf-8')
      } catch (writeError) {
        logger.warn(
          'Failed to save migrated project (will use migrated version in memory):',
          writeError
        )
      }
    }

    return validatedProject
  } catch (error) {
    logger.error('Failed to read project file:', error)
    return null
  }
}

export const getAllProjects = (): Project[] => {
  if (!fs.existsSync(projectsDir)) {
    logger.warn('Projects directory does not exist')
    return []
  }

  const configFilePath = path.join(app.getPath('userData'), 'config.json')
  let recentProjectId = ''
  let mostRecentProjectIds: string[] = []

  try {
    if (fs.existsSync(configFilePath)) {
      const configData = fs.readFileSync(configFilePath, 'utf-8')
      if (configData.trim()) {
        const config = JSON.parse(configData)
        recentProjectId = config.recentProjectId || ''
        mostRecentProjectIds = Array.isArray(config.mostRecentProjectIds)
          ? config.mostRecentProjectIds
          : []
      }
    }
  } catch (error) {
    logger.error('Failed to read config for project list:', error)
    return []
  }

  logger.info('Most recent project IDs:', mostRecentProjectIds)

  const projectFiles: string[] = []
  const seen = new Set<string>()

  mostRecentProjectIds.forEach((projectId) => {
    const filePath = path.join(projectsDir, projectId)
    if (fs.existsSync(filePath) && !seen.has(filePath)) {
      projectFiles.push(filePath)
      seen.add(filePath)
    }
  })

  if (recentProjectId) {
    const filePath = path.join(projectsDir, recentProjectId)
    if (fs.existsSync(filePath) && !seen.has(filePath)) {
      projectFiles.push(filePath)
      seen.add(filePath)
    }
  }

  logger.info('Project files:', projectFiles)

  const projects: Project[] = []
  projectFiles.forEach((filePath) => {
    try {
      const projectData = fs.readFileSync(filePath, 'utf-8')
      if (!projectData.trim()) {
        logger.warn('Empty project file:', filePath)
        return
      }

      const parsedData = JSON.parse(projectData)
      const validatedProject = validateAndMigrateProject(parsedData)

      if (validatedProject) {
        projects.push(validatedProject)
      } else {
        logger.warn('Failed to validate project:', filePath)
      }
    } catch (error) {
      logger.error('Failed to load project file:', filePath, error)
    }
  })

  return projects
}

export const duplicateProject = (
  sourceFilename: string,
  newName: string,
  newDescription: string
): Project | null => {
  const source = getProject(sourceFilename)
  if (!source) {
    logger.warn('Source project not found for duplication:', sourceFilename)
    return null
  }

  const newId = newName.replace(/\s/g, '').toLowerCase()
  const duplicate: Project = {
    ...source,
    id: newId,
    name: newName,
    description: newDescription,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  saveProject(duplicate)
  logger.info('Duplicated project:', source.id, '->', newId)
  return duplicate
}

export const deleteProject = (projectId: string): boolean => {
  logger.info('Deleting project:', projectId)
  const filePath = path.join(projectsDir, `${projectId}.project.json`)

  if (!fs.existsSync(filePath)) {
    logger.warn('Project file does not exist, cannot delete:', filePath)
    return false
  }

  try {
    fs.unlinkSync(filePath)
    logger.info('Successfully deleted project:', filePath)
    return true
  } catch (error) {
    logger.error('Failed to delete project file:', error)
    return false
  }
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Project } from '@/types'
import { Label } from '@radix-ui/react-label'
import { useState } from 'react'
import { MdKeyboardArrowDown } from 'react-icons/md'
import { ProjectModal } from './projectModal'

interface ProjectMenuProps {
  projects: Project[] | null
  currentProject: Project | null
  currentFile: string | ''
}

export function ProjectMenu({ projects, currentProject, currentFile }: ProjectMenuProps) {
  // State
  const [modalOpen, setModalOpen] = useState(false)
  const [projectAlreadyExists, setProjectAlreadyExists] = useState(false)
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [projectToDuplicate, setProjectToDuplicate] = useState<Project | null>(null)
  const [duplicateAlreadyExists, setDuplicateAlreadyExists] = useState(false)

  // Handlers
  const handleSelectProject = async (projectId: string) => {
    if (projectId) {
      await window.configAPI.updateRecentProjectId(projectId)

      if (currentProject) {
        await window.configAPI.updateRecentProjectIds(currentFile, projectId)
      }

      window.location.reload()
    }
  }

  const handleBrowseFiles = async () => {
    const selectedFile = await window.dialogAPI.selectFile()
    if (selectedFile) {
      handleSelectProject(selectedFile)
    }
  }

  const handleAddProject = () => {
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
  }

  const handleOpenDuplicate = () => {
    if (!currentProject) return
    setProjectToDuplicate({ ...currentProject, name: `Copy of ${currentProject.name}` })
    setDuplicateAlreadyExists(false)
    setDuplicateModalOpen(true)
  }

  const handleCloseDuplicate = () => {
    setDuplicateModalOpen(false)
    setProjectToDuplicate(null)
  }

  const handleSaveDuplicate = async (newProject: Project) => {
    const newId = newProject.name.replace(/\s/g, '').toLowerCase()
    const exists = await window.projectAPI.getProject(`${newId}.project.json`)
    if (exists) {
      setDuplicateAlreadyExists(true)
      return
    }

    const result = await window.projectAPI.duplicateProject(
      currentFile,
      newProject.name,
      newProject.description || ''
    )
    if (result) {
      handleSelectProject(`${result.id}.project.json`)
    }
    setDuplicateModalOpen(false)
  }

  const handleSaveProject = async (newProject: Project, isNewProject: boolean) => {
    if (isNewProject) {
      const id = newProject.name.replace(/\s/g, '').toLowerCase()
      newProject.id = id

      const projectExists = await checkForExistingProject(newProject.id)
      if (projectExists) {
        setProjectAlreadyExists(true)
        return
      }

      setProjectAlreadyExists(false)
      newProject.createdAt = new Date().toISOString()
      newProject.updatedAt = new Date().toISOString()
    }

    window.projectAPI.saveProject(newProject)
    handleSelectProject(`${newProject.id}.project.json`)
    setModalOpen(false)
  }

  const checkForExistingProject = async (projectId: string) => {
    const existingProject = await window.projectAPI.getProject(`${projectId}.project.json`)
    return existingProject !== null
  }

  // Helper render functions
  const renderProjectName = () => (
    <>
      <span className="min-w-0 truncate">{currentProject?.name ?? 'No project selected'}</span>
      <MdKeyboardArrowDown className="flex-shrink-0 text-[13px]" />
    </>
  )

  const renderRecentProjects = () => {
    if (!projects || projects.length === 0) {
      return null
    }

    const filteredProjects = projects
      .filter((project) => project.id !== currentProject?.id)
      .reverse()

    return (
      <>
        <DropdownMenuGroup>
          {filteredProjects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              className="hover:bg-primary cursor-pointer"
              onClick={() => handleSelectProject(`${project.id}.project.json`)}
            >
              {project.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
      </>
    )
  }

  return (
    <>
      <div className="flex min-w-0 items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Breadcrumb trigger (C2): quiet text, no chrome — the title beside
                it carries the weight. */}
            <button
              type="button"
              className="flex min-w-0 max-w-[280px] items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              title={currentProject?.name}
            >
              {renderProjectName()}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            {/* Create New Project Option */}
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer" onClick={handleAddProject}>
                New Project
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            {/* Duplicate Current Project */}
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={handleOpenDuplicate}
                disabled={!currentProject}
              >
                Duplicate Project
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            {/* Recent Projects */}
            <Label htmlFor="project-select" className="text-xs px-2">
              Recent...
            </Label>
            {renderRecentProjects()}

            {/* Browse Files */}
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer" onClick={handleBrowseFiles}>
                Browse...
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Project Creation/Edit Modal */}
      <ProjectModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveProject}
        error={projectAlreadyExists}
      />

      {/* Duplicate Project Modal */}
      <ProjectModal
        isOpen={duplicateModalOpen}
        onClose={handleCloseDuplicate}
        project={projectToDuplicate}
        onSave={handleSaveDuplicate}
        titleText="Duplicate Project"
        submitLabel="Duplicate"
        error={duplicateAlreadyExists}
      />
    </>
  )
}

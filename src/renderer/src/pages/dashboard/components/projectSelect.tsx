import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Project } from '@/types'
import { useState } from 'react'
import { LuTrash2 } from 'react-icons/lu'
import { MdKeyboardArrowDown } from 'react-icons/md'
import { ConfirmModal } from './confirmModal'
import { ProjectModal } from './projectModal'

interface ProjectMenuProps {
  projects: Project[] | null
  currentProject: Project | null
  currentFile: string | ''
  onOpenProjectFile: () => void
}

export function ProjectMenu({
  projects,
  currentProject,
  currentFile,
  onOpenProjectFile
}: ProjectMenuProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [projectAlreadyExists, setProjectAlreadyExists] = useState(false)
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [projectToDuplicate, setProjectToDuplicate] = useState<Project | null>(null)
  const [duplicateAlreadyExists, setDuplicateAlreadyExists] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  // Main trashes the file and prunes the recents, then reports what to open in its place;
  // reloading picks that up rather than re-deriving the selection here.
  const handleDeleteProject = async () => {
    setConfirmDelete(false)
    if (!currentFile) return

    await window.projectAPI.deleteProject(currentFile)
    window.location.reload()
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

  const otherProjects = (projects ?? [])
    .filter((project) => project.id !== currentProject?.id)
    .reverse()

  const commandCount = currentProject?.commands.length ?? 0
  const flowCount = currentProject?.flows.length ?? 0

  return (
    <>
      <div className="flex min-w-0 items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 max-w-[280px] items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              title={currentProject?.name}
            >
              <span className="min-w-0 truncate">
                {currentProject?.name ?? 'No project selected'}
              </span>
              <MdKeyboardArrowDown className="flex-shrink-0 text-[13px]" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-60" align="start">
            <DropdownMenuLabel className="font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-glyph-dim">
              Open
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {otherProjects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  className="cursor-pointer text-[13px]"
                  onSelect={() => handleSelectProject(`${project.id}.project.json`)}
                >
                  <span className="min-w-0 truncate">{project.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="cursor-pointer text-[13px]" onSelect={handleBrowseFiles}>
                Browse…
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer text-[13px]" onSelect={handleAddProject}>
                New project
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-[13px]"
                disabled={!currentProject}
                onSelect={handleOpenDuplicate}
              >
                Duplicate project
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-[13px]"
                disabled={!currentProject}
                onSelect={onOpenProjectFile}
              >
                Edit project JSON
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="cursor-pointer text-[13px] text-red-300 focus:text-red-300"
              disabled={!currentProject}
              onSelect={() => setConfirmDelete(true)}
            >
              Delete project…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ProjectModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveProject}
        error={projectAlreadyExists}
      />

      <ProjectModal
        isOpen={duplicateModalOpen}
        onClose={handleCloseDuplicate}
        project={projectToDuplicate}
        onSave={handleSaveDuplicate}
        titleText="Duplicate project"
        submitLabel="Duplicate"
        error={duplicateAlreadyExists}
      />

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDeleteProject}
        marker={<LuTrash2 className="h-3.5 w-3.5 text-red-400" aria-hidden />}
        title="Delete project"
        confirmLabel="Delete project"
        description="Move this project's file to the trash."
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{currentProject?.name}</span> holds{' '}
          {commandCount} command{commandCount === 1 ? '' : 's'} and {flowCount} flow
          {flowCount === 1 ? '' : 's'}.
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Its file goes to the trash, so you can put it back from there. Reverb opens your most
          recent other project instead.
        </p>
      </ConfirmModal>
    </>
  )
}

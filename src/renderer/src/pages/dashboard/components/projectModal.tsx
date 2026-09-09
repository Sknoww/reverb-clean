import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Project } from '@/types'
import { useEffect, useState } from 'react'
import { LuFolder } from 'react-icons/lu'
import {
  Field,
  FIELD_ERROR_BORDER,
  FIELD_INPUT,
  FIELD_TEXTAREA,
  MODAL_CONTENT,
  MODAL_FORM,
  ModalBody,
  ModalFooter,
  ModalHeader
} from './modalShell'

const defaultProject: Project = {
  id: '',
  name: '',
  description: '',
  createdAt: '',
  updatedAt: '',
  commands: [],
  flows: []
}

interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  project?: Project | null
  onSave: (project: Project, isNewProject: boolean) => void
  title?: string
  error?: boolean
  titleText?: string
  submitLabel?: string
}

export function ProjectModal({
  isOpen,
  onClose,
  project = null,
  onSave,
  title = 'project',
  error,
  titleText,
  submitLabel
}: ProjectModalProps) {
  const [editedProject, setEditedProject] = useState<Project>(project || { ...defaultProject })
  const [nameEdited, setNameEdited] = useState(false)
  const isNewProject = !project

  useEffect(() => {
    setEditedProject(project ?? { ...defaultProject })
    setNameEdited(false)
  }, [project, isOpen])

  // The duplicate-name flag is owned by the caller and only clears on save, so hide the
  // message while the user is fixing the field it hangs off.
  useEffect(() => {
    if (error) setNameEdited(false)
  }, [error])

  const showNameError = Boolean(error) && !nameEdited

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'name') setNameEdited(true)
    setEditedProject((prev) => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setNameEdited(false)
    onSave(editedProject, isNewProject)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={MODAL_CONTENT} showCloseButton={false}>
        <form onSubmit={handleSubmit} className={MODAL_FORM}>
          <ModalHeader
            marker={<LuFolder size={14} className="text-accent-indigo" aria-hidden />}
            title={titleText ?? `${isNewProject ? 'New' : 'Edit'} ${title}`}
            onClose={onClose}
          />
          <DialogDescription className="sr-only">
            {isNewProject ? 'Enter project details' : 'Edit project details'}
          </DialogDescription>

          <ModalBody>
            <Field
              htmlFor="project-name"
              label="Name"
              error={
                showNameError
                  ? 'A project with this name already exists. Choose a different name.'
                  : null
              }
            >
              <Input
                id="project-name"
                name="name"
                value={editedProject.name}
                onChange={handleInputChange}
                className={`${FIELD_INPUT} ${showNameError ? FIELD_ERROR_BORDER : ''}`}
                aria-invalid={showNameError}
                aria-describedby={showNameError ? 'project-name-error' : undefined}
                required
              />
            </Field>

            <Field htmlFor="project-description" label="Description" optional>
              <Textarea
                id="project-description"
                name="description"
                value={editedProject.description}
                onChange={handleInputChange}
                className={`${FIELD_TEXTAREA} h-[62px] min-h-[62px]`}
              />
            </Field>
          </ModalBody>

          <ModalFooter
            onCancel={onClose}
            submitLabel={submitLabel ?? (isNewProject ? 'Create' : 'Save changes')}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}

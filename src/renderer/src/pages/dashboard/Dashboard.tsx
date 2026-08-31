import { Shell } from '@/components/mainContainer'
import { LastRun, StatusBar } from '@/components/statusBar'
import { AdbCommand, Config, Flow, Project, ProvisionProgress, ProvisionResult } from '@/types'
import { useCallback, useEffect, useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { CommandModal } from './components/commandModal'
import { CommandDock } from './components/commandDock'
import { DeleteModal } from './components/deleteModal'
import { FlowModal } from './components/flowModal'
import { ProvisionResultModal } from './components/provisionResultModal'
import { ShellDndProvider } from './components/shellDndContext'
import { TargetCapabilities, targetCapabilities } from './components/targetNotice'
import { TopBar } from './components/topBar'
import { ConsoleProvider } from './contexts/consoleContext'
import { DeviceProvider } from './contexts/deviceContext'
import { FlowProvider, useFlowContext } from './contexts/flowContext'
import { SyncProvider } from './contexts/syncContext'
import { CommandTab } from './tabs/commandTab'
import { ConsoleTab } from './tabs/consoleTab'
import { FlowTab } from './tabs/flowTab'
import { SettingsTab } from './tabs/settingsTab'
import { SyncTab } from './tabs/syncTab'

export interface ShellContext {
  project: Project | null
  config: Config

  target: TargetCapabilities

  reloadConfig: () => Promise<void>
  handleAddCommand: (isCommon: boolean, inputValue?: string, type?: string) => void
  handleEditCommand: (command: AdbCommand | null, isCommon: boolean) => void
  handleShowDeleteCommand: (command: AdbCommand) => void
  handleSendCommand: (command: AdbCommand) => Promise<unknown>
  handleReorderCommands: (commands: AdbCommand[]) => void

  handleShowDeleteCommonCommand: (command: AdbCommand) => void
  handleReorderCommonCommands: (commands: AdbCommand[]) => void
  handleEditFlow: (flow: Flow) => void
  handleShowDeleteFlow: (flow: Flow) => void
  handleSendFlow: (flow: Flow) => void
  handleAddCommandToFlow: (flow: Flow) => void
  handleEditFlowCommand: (flow: Flow, command: AdbCommand) => void
  handleDeleteFlowCommand: (flow: Flow, command: AdbCommand) => void
  handleCopyFlowCommand: (flow: Flow, command: AdbCommand) => void
  handleReorderFlowCommands: (flow: Flow, commands: AdbCommand[]) => void
}

export function useShellContext() {
  return useOutletContext<ShellContext>()
}

type ModalState =
  | null
  | { modal: 'command'; command: AdbCommand; isCommon: boolean; isEditing: boolean }
  | { modal: 'command-flow'; command: AdbCommand; flow: Flow; isEditing: boolean }
  | { modal: 'delete'; title: string; message: string; onConfirm: () => void }
  | { modal: 'flow'; flow: Flow | null }

function ShellLayout() {
  const {
    runningFlowId,
    setRunningFlowId,
    runningCommandIndex,
    setRunningCommandIndex,
    abortController,
    setAbortController,
    isFlowRunning,
    setIsFlowRunning
  } = useFlowContext()

  const [config, setConfig] = useState<Config>({
    saveLocation: '',
    currentDeviceId: '',
    recentProjectId: '',
    mostRecentProjectIds: [],
    commonCommands: []
  })
  const [project, setProject] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [modalState, setModalState] = useState<ModalState>(null)
  const [validationError, setValidationError] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [lastRun, setLastRun] = useState<LastRun | null>(null)

  const [provisionProgress, setProvisionProgress] = useState<ProvisionProgress | null>(null)

  const [provisionFailure, setProvisionFailure] = useState<{
    result: ProvisionResult
    lead?: string
  } | null>(null)

  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true)
      try {
        const loadedConfig = await window.configAPI.getConfig()
        setConfig(loadedConfig)

        if (loadedConfig.recentProjectId) {
          const loadedProject = await window.projectAPI.getProject(loadedConfig.recentProjectId)
          setProject(loadedProject)
        }

        const loadedProjects = await window.projectAPI.getAllProjects()
        setProjects(loadedProjects)
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialData()
  }, [])

  const reloadConfig = useCallback(async () => {
    try {
      setConfig(await window.configAPI.getConfig())
      setProjects(await window.projectAPI.getAllProjects())
    } catch (error) {
      console.error('Error reloading config:', error)
    }
  }, [])

  useEffect(() => window.provisionAPI.onProgress(setProvisionProgress), [])

  useEffect(() => {
    if (config.recentProjectId && config.saveLocation && projects.length > 0) {
      const found = projects.find((p) => p.id === config.recentProjectId)
      if (found) setProject(found)
    }
  }, [config.recentProjectId, projects])

  const closeModal = useCallback(() => {
    setModalState(null)
    setValidationError(false)
  }, [])

  const handleAddCommand = (isCommon: boolean, inputValue?: string, type?: string) => {
    setModalState({
      modal: 'command',
      command: {
        id: uuid(),
        name: '',
        type: type ?? 'barcode',
        keyword: '',
        value: inputValue ?? '',
        description: ''
      },
      isCommon,
      isEditing: false
    })
  }

  const handleEditCommand = useCallback((command: AdbCommand | null, isCommon: boolean) => {
    if (!command) return
    setModalState({
      modal: 'command',
      command,
      isCommon,
      isEditing: true
    })
  }, [])

  const handleSaveCommand = (updatedCommand: AdbCommand, previousCommand?: AdbCommand | null) => {
    if (!modalState) return

    if (modalState.modal === 'command-flow') {
      if (!project) return
      const { flow, isEditing } = modalState
      const updatedFlows = project.flows.map((f) => {
        if (f.id !== flow.id) return f
        const commands =
          isEditing && previousCommand
            ? f.commands.map((cmd) => (cmd.id === previousCommand.id ? updatedCommand : cmd))
            : [...f.commands, { ...updatedCommand, id: updatedCommand.id || uuid() }]
        return { ...f, commands }
      })
      const updatedProject = { ...project, flows: updatedFlows }
      setProject(updatedProject)
      window.projectAPI.saveProject(updatedProject)
      closeModal()
      return
    }

    if (modalState.modal !== 'command') return
    const { isCommon, isEditing } = modalState

    const existingCommands = isCommon ? config.commonCommands : (project?.commands ?? [])
    if (isEditing && previousCommand && previousCommand.keyword !== updatedCommand.keyword) {
      const duplicate = existingCommands.some((c) => c.keyword === updatedCommand.keyword)
      if (duplicate) {
        setValidationError(true)
        return
      }
    }

    if (isCommon) {
      const updated =
        isEditing && previousCommand
          ? config.commonCommands.map((c) =>
              c.keyword === previousCommand.keyword ? updatedCommand : c
            )
          : [...config.commonCommands, updatedCommand]
      setConfig((prev) => ({ ...prev, commonCommands: updated }))
      window.configAPI.updateCommonCommands(updated)
      closeModal()
    } else if (project) {
      const updated =
        isEditing && previousCommand
          ? project.commands.map((c) =>
              c.keyword === previousCommand.keyword ? updatedCommand : c
            )
          : [...project.commands, updatedCommand]
      const updatedProject = { ...project, commands: updated }
      setProject(updatedProject)
      window.projectAPI.saveProject(updatedProject)
      closeModal()
    }
  }

  const handleShowDeleteModal = useCallback(
    (command: AdbCommand) => {
      setModalState({
        modal: 'delete',
        title: 'Delete Command',
        message: `Delete "${command.name || command.keyword}"? This can't be undone.`,
        onConfirm: () => {
          if (!project) return
          const updatedProject = {
            ...project,
            commands: project.commands.filter((c) => c.keyword !== command.keyword)
          }
          setProject(updatedProject)
          window.projectAPI.saveProject(updatedProject)
          setModalState(null)
        }
      })
    },
    [project]
  )

  const handleShowDeleteCommonModal = useCallback(
    (command: AdbCommand) => {
      setModalState({
        modal: 'delete',
        title: 'Delete Common Command',
        message: `Delete "${command.name || command.keyword}"? This can't be undone.`,
        onConfirm: () => {
          const filtered = config.commonCommands.filter((c) => c.keyword !== command.keyword)
          setConfig((prev) => ({ ...prev, commonCommands: filtered }))
          window.configAPI.updateCommonCommands(filtered)
          setModalState(null)
        }
      })
    },
    [config.commonCommands]
  )

  const handleReorderCommonCommands = (reorderedCommands: AdbCommand[]) => {
    setConfig((prev) => ({ ...prev, commonCommands: reorderedCommands }))
    window.configAPI.updateCommonCommands(reorderedCommands)
  }

  const handleReorderCommands = (reorderedCommands: AdbCommand[]) => {
    if (!project) return
    const updatedProject = { ...project, commands: reorderedCommands }
    setProject(updatedProject)
    window.projectAPI.saveProject(updatedProject)
  }

  const handleSendCommand = useCallback(async (command: AdbCommand) => {
    const startedAt = performance.now()
    const label = command.name || command.keyword
    try {
      const result = await window.adbAPI.executeCommand(command.type, command.value)
      setLastRun({
        label,
        ms: Math.round(performance.now() - startedAt),
        ok: result?.success !== false
      })
      return result
    } catch (error) {
      setLastRun({ label, ms: Math.round(performance.now() - startedAt), ok: false })
      throw error
    }
  }, [])

  const handleSaveFlow = async (updatedFlow: Flow, isNewFlow: boolean) => {
    if (!project) return

    if (!isNewFlow) {
      const updatedFlows = project.flows.map((f) => (f.id === updatedFlow.id ? updatedFlow : f))
      const updatedProject = { ...project, flows: updatedFlows }
      setProject(updatedProject)
      window.projectAPI.saveProject(updatedProject)
    } else {
      const flowExists = project.flows.some(
        (f) => f.name === updatedFlow.name && f.id !== updatedFlow.id
      )
      if (flowExists) {
        setValidationError(true)
        return
      }
      const updatedProject = { ...project, flows: [...project.flows, updatedFlow] }
      setProject(updatedProject)
      window.projectAPI.saveProject(updatedProject)
    }

    setValidationError(false)
    closeModal()
  }

  const handleShowFlowModal = () => {
    setModalState({ modal: 'flow', flow: null })
  }

  const handleEditFlow = useCallback((flow: Flow) => {
    setModalState({ modal: 'flow', flow })
  }, [])

  const handleShowDeleteFlowModal = useCallback(
    (flow: Flow) => {
      setModalState({
        modal: 'delete',
        title: 'Delete Flow',
        message: `Delete "${flow.name}"? This can't be undone.`,
        onConfirm: () => {
          if (!project) return
          const updatedProject = {
            ...project,
            flows: project.flows.filter((f) => f.id !== flow.id)
          }
          setProject(updatedProject)
          window.projectAPI.saveProject(updatedProject)
          setModalState(null)
        }
      })
    },
    [project]
  )

  const handleAddCommandToFlow = useCallback((flow: Flow) => {
    setModalState({
      modal: 'command-flow',
      command: { id: uuid(), name: '', type: 'barcode', keyword: '', value: '', description: '' },
      flow,
      isEditing: false
    })
  }, [])

  const handleEditFlowCommand = useCallback((flow: Flow, command: AdbCommand) => {
    setModalState({
      modal: 'command-flow',
      command,
      flow,
      isEditing: true
    })
  }, [])

  const handleDeleteFlowCommand = useCallback(
    (flow: Flow, command: AdbCommand) => {
      setModalState({
        modal: 'delete',
        title: 'Remove Command from Flow',
        message: `Remove "${command.name || command.keyword}" from "${flow.name}"?`,
        onConfirm: () => {
          if (!project) return
          const updatedFlows = project.flows.map((f) => {
            if (f.id !== flow.id) return f
            return { ...f, commands: f.commands.filter((cmd) => cmd.id !== command.id) }
          })
          const updatedProject = { ...project, flows: updatedFlows }
          setProject(updatedProject)
          window.projectAPI.saveProject(updatedProject)
          setModalState(null)
        }
      })
    },
    [project]
  )

  const handleCopyFlowCommand = (flow: Flow, command: AdbCommand) => {
    if (!project) return
    const commandCopy = { ...command, id: uuid(), name: command.name }
    const updatedFlows = project.flows.map((f) => {
      if (f.id !== flow.id) return f
      const idx = f.commands.findIndex((cmd) => cmd.id === command.id)
      const commands = [...f.commands]
      commands.splice(idx + 1, 0, commandCopy)
      return { ...f, commands }
    })
    const updatedProject = { ...project, flows: updatedFlows }
    setProject(updatedProject)
    window.projectAPI.saveProject(updatedProject)
  }

  const handleReorderFlows = (reorderedFlows: Flow[]) => {
    if (!project) return
    const updatedProject = { ...project, flows: reorderedFlows }
    setProject(updatedProject)
    window.projectAPI.saveProject(updatedProject)
  }

  const handleDropCommandOnFlow = (flow: Flow, command: AdbCommand) => {
    if (!project) return
    const updatedFlows = project.flows.map((f) =>
      f.id === flow.id ? { ...f, commands: [...f.commands, { ...command, id: uuid() }] } : f
    )
    const updatedProject = { ...project, flows: updatedFlows }
    setProject(updatedProject)
    window.projectAPI.saveProject(updatedProject)
  }

  const handleReorderFlowCommands = (flow: Flow, reorderedCommands: AdbCommand[]) => {
    if (!project) return
    const updatedFlows = project.flows.map((f) =>
      f.id === flow.id ? { ...f, commands: reorderedCommands } : f
    )
    const updatedProject = { ...project, flows: updatedFlows }
    setProject(updatedProject)
    window.projectAPI.saveProject(updatedProject)
  }

  const sleep = (ms: number, signal: AbortSignal) => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => {
        clearTimeout(timeout)
        reject(new Error('Sleep aborted'))
      })
    })
  }

  const handleSendFlow = async (flow: Flow) => {
    if (isFlowRunning && runningFlowId === flow.id && abortController) {
      abortController.abort()
      setIsFlowRunning(false)
      setRunningFlowId(null)
      setRunningCommandIndex(null)
      setAbortController(null)
      return
    }

    const controller = new AbortController()
    setIsFlowRunning(true)
    setRunningFlowId(flow.id)
    setRunningCommandIndex(null)
    setAbortController(controller)

    try {
      for (let i = 0; i < flow.commands.length; i++) {
        if (controller.signal.aborted) break

        setRunningCommandIndex(i)
        try {
          await handleSendCommand(flow.commands[i])
          await sleep(flow.delay, controller.signal)
        } catch (error: any) {
          if (error.message === 'Sleep aborted' || controller.signal.aborted) break
          console.error('Error executing command:', error)
        }
      }
    } catch {
    } finally {
      setIsFlowRunning(false)
      setRunningFlowId(null)
      setRunningCommandIndex(null)
      setAbortController(null)
    }
  }

  const handleRefreshProject = async () => {
    if (!project || !config.recentProjectId) return
    try {
      const refreshed = await window.projectAPI.getProject(config.recentProjectId)
      if (refreshed !== null) setProject(refreshed)
      const refreshedProjects = await window.projectAPI.getAllProjects()
      setProjects(refreshedProjects)
    } catch (error) {
      console.error('Error refreshing project:', error)
    }
  }

  const handleOpenProjectFile = async () => {
    if (!project) return
    try {
      await window.dialogAPI.openInEditor(`${config.saveLocation}/${project.id}.project.json`)
    } catch (error) {
      console.error('Error opening file:', error)
    }
  }

  const runDeviceAction = useCallback(
    async <T extends { success: boolean }>(
      label: string,
      action: () => Promise<T>
    ): Promise<T | null> => {
      const startedAt = performance.now()
      try {
        const result = await action()
        setLastRun({
          label,
          ms: Math.round(performance.now() - startedAt),
          ok: result?.success !== false
        })
        return result
      } catch {
        setLastRun({ label, ms: Math.round(performance.now() - startedAt), ok: false })
        return null
      } finally {
        setProvisionProgress(null)
      }
    },
    []
  )

  const handleResetClient = useCallback(
    () => void runDeviceAction('Reset client', () => window.adbAPI.executeApplicationReset()),
    [runDeviceAction]
  )

  const handleClearStorage = useCallback(async () => {
    const result = await runDeviceAction('Clear storage', () => window.adbAPI.clearStorage())
    if (result?.provision && !result.provision.success) {
      setProvisionFailure({
        result: result.provision,
        lead: 'Storage was cleared, but provisioning failed — the client was left stopped rather than relaunched half-provisioned.'
      })
    }
  }, [runDeviceAction])

  const handleRunProvision = useCallback(async () => {
    const result = await runDeviceAction('Provisioning', () => window.provisionAPI.run())
    if (result && !result.success) setProvisionFailure({ result })
  }, [runDeviceAction])

  const dockCollapsed = config.dockCollapsed ?? false

  const handleToggleDock = useCallback(() => {
    const next = !dockCollapsed
    setConfig((prev) => ({ ...prev, dockCollapsed: next }))

    void window.configAPI.updateDockCollapsed(next)
  }, [dockCollapsed])

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const target = targetCapabilities(config.target)

  const shellContext: ShellContext = {
    project,
    config,
    target,
    reloadConfig,
    handleAddCommand,
    handleEditCommand,
    handleShowDeleteCommand: handleShowDeleteModal,
    handleSendCommand,
    handleReorderCommands,
    handleShowDeleteCommonCommand: handleShowDeleteCommonModal,
    handleReorderCommonCommands,
    handleEditFlow,
    handleShowDeleteFlow: handleShowDeleteFlowModal,
    handleSendFlow,
    handleAddCommandToFlow,
    handleEditFlowCommand,
    handleDeleteFlowCommand,
    handleCopyFlowCommand,
    handleReorderFlowCommands
  }

  const runningFlow = runningFlowId
    ? (project?.flows.find((f) => f.id === runningFlowId) ?? null)
    : null
  const flowProgress =
    isFlowRunning && runningFlow
      ? {
          name: runningFlow.name,
          step: (runningCommandIndex ?? 0) + 1,
          total: runningFlow.commands.length
        }
      : null

  const topBar = (
    <TopBar
      project={project}
      projects={projects}
      config={config}
      onRefreshProject={handleRefreshProject}
      onNewFlow={handleShowFlowModal}
      onResetClient={handleResetClient}
      onClearStorage={handleClearStorage}
      onRunProvision={handleRunProvision}
      canResetClient={target.reset}
      canProvision={(config.provision?.steps.length ?? 0) > 0}
      onOpenProjectFile={handleOpenProjectFile}
    />
  )

  const dock = (
    <CommandDock
      commands={config.commonCommands}
      collapsed={dockCollapsed}
      onToggleCollapsed={handleToggleDock}
      handleAddCommand={handleAddCommand}
      handleEditCommand={handleEditCommand}
      handleShowDeleteModal={handleShowDeleteCommonModal}
      handleSendCommand={handleSendCommand}
      canSend={target.commands}
    />
  )

  return (
    <>
      <DeviceProvider
        config={config}
        onDeviceChange={(deviceId) => setConfig((prev) => ({ ...prev, currentDeviceId: deviceId }))}
      >
        <ShellDndProvider
          commonCommands={config.commonCommands}
          flows={project?.flows ?? []}
          onReorderCommonCommands={handleReorderCommonCommands}
          onReorderFlows={handleReorderFlows}
          onDropCommandOnFlow={handleDropCommandOnFlow}
        >
          <Shell
            topBar={topBar}
            dock={dock}
            statusBar={
              <StatusBar
                lastRun={lastRun}
                flowProgress={flowProgress}
                provisionProgress={provisionProgress}
                packageId={config.target?.packageId ?? ''}
              />
            }
            dockCollapsed={dockCollapsed}
          >
            <Outlet context={shellContext} />
          </Shell>
        </ShellDndProvider>
      </DeviceProvider>

      {(modalState?.modal === 'command' || modalState?.modal === 'command-flow') && (
        <CommandModal
          isOpen={true}
          onClose={closeModal}
          command={modalState.command}
          onSave={handleSaveCommand}
          isEditing={modalState.isEditing}
          title={
            modalState.modal === 'command-flow' ? `command in ${modalState.flow.name}` : 'command'
          }
          error={validationError}
        />
      )}

      {modalState?.modal === 'delete' && (
        <DeleteModal
          isOpen={true}
          onClose={closeModal}
          onConfirm={modalState.onConfirm}
          title={modalState.title}
          message={modalState.message}
        />
      )}

      {provisionFailure && (
        <ProvisionResultModal
          isOpen={true}
          onClose={() => setProvisionFailure(null)}
          result={provisionFailure.result}
          lead={provisionFailure.lead}
        />
      )}

      {modalState?.modal === 'flow' && (
        <FlowModal
          isOpen={true}
          onClose={closeModal}
          flow={modalState.flow}
          onSave={handleSaveFlow}
          title="flow"
          error={validationError}
          defaultDelay={config.behavior?.flowDelayMs ?? 5000}
        />
      )}
    </>
  )
}

export function CommandScreen() {
  const s = useShellContext()
  return (
    <CommandTab
      project={s.project}
      handleAddCommand={s.handleAddCommand}
      handleEditCommand={s.handleEditCommand}
      handleShowDeleteModal={s.handleShowDeleteCommand}
      handleSendCommand={s.handleSendCommand}
      handleReorderCommands={s.handleReorderCommands}
      canSend={s.target.commands}
    />
  )
}

export function FlowScreen() {
  const s = useShellContext()
  return (
    <FlowTab
      project={s.project}
      handleEditFlow={s.handleEditFlow}
      handleShowDeleteModal={s.handleShowDeleteFlow}
      handleSendFlow={s.handleSendFlow}
      handleSendFlowCommand={s.handleSendCommand}
      handleAddCommandToFlow={s.handleAddCommandToFlow}
      handleEditFlowCommand={s.handleEditFlowCommand}
      handleDeleteFlowCommand={s.handleDeleteFlowCommand}
      handleCopyFlowCommand={s.handleCopyFlowCommand}
      handleReorderFlowCommands={s.handleReorderFlowCommands}
      canSend={s.target.commands}
    />
  )
}

export function ConsoleScreen() {
  const s = useShellContext()
  return <ConsoleTab currentDeviceId={s.config.currentDeviceId} canRun={s.target.scripts} />
}

export function SyncScreen() {
  return <SyncTab />
}

export function SettingsScreen() {
  const s = useShellContext()
  return (
    <SettingsTab
      config={s.config}
      onConfigChanged={s.reloadConfig}
      onAddCommonCommand={() => s.handleAddCommand(true, undefined, 'barcode')}
      onEditCommonCommand={(command) => s.handleEditCommand(command, true)}
      onDeleteCommonCommand={s.handleShowDeleteCommonCommand}
      onReorderCommonCommands={s.handleReorderCommonCommands}
    />
  )
}

export function Dashboard() {
  return (
    <FlowProvider>
      <ConsoleProvider>
        <SyncProvider>
          <ShellLayout />
        </SyncProvider>
      </ConsoleProvider>
    </FlowProvider>
  )
}

export default Dashboard

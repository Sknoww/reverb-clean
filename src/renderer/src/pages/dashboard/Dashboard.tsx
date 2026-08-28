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

// ========================================================================= Shell context — shared state/handlers the routed screens read...

export interface ShellContext {
  project: Project | null
  config: Config
  /** What the configured target lets this session do (area 19). */
  target: TargetCapabilities
  /** Re-read config from main. */
  reloadConfig: () => Promise<void>
  handleAddCommand: (isCommon: boolean, inputValue?: string, type?: string) => void
  handleEditCommand: (command: AdbCommand | null, isCommon: boolean) => void
  handleShowDeleteCommand: (command: AdbCommand) => void
  handleSendCommand: (command: AdbCommand) => Promise<unknown>
  handleReorderCommands: (commands: AdbCommand[]) => void
  /** Common-command peers of the delete/reorder handlers above. */
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

// ========================================================================= Modal State — single discriminated union replaces ~13...

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

  // ========================================================================= State...

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
  // Status-bar last-run readout (C8). Session-only — it reports what just
  // happened, so there's nothing worth persisting.
  const [lastRun, setLastRun] = useState<LastRun | null>(null)
  // Live provisioning progress, pushed from main (28b2).
  const [provisionProgress, setProvisionProgress] = useState<ProvisionProgress | null>(null)
  // Failure only. A routine that worked says so in the status bar; a routine that
  // stopped has a step list worth reading (§1.15).
  const [provisionFailure, setProvisionFailure] = useState<{
    result: ProvisionResult
    lead?: string
  } | null>(null)

  // ========================================================================= Data Loading...

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

  // Settings edits fields this component doesn't own (paths, and after a snapshot restore or bundle import, all of them), so it needs a way...
  const reloadConfig = useCallback(async () => {
    try {
      setConfig(await window.configAPI.getConfig())
      setProjects(await window.projectAPI.getAllProjects())
    } catch (error) {
      console.error('Error reloading config:', error)
    }
  }, [])

  // The app's only main → renderer subscription (28b2).
  useEffect(() => window.provisionAPI.onProgress(setProvisionProgress), [])

  useEffect(() => {
    if (config.recentProjectId && config.saveLocation && projects.length > 0) {
      const found = projects.find((p) => p.id === config.recentProjectId)
      if (found) setProject(found)
    }
  }, [config.recentProjectId, projects])

  // ========================================================================= Modal Helpers...

  const closeModal = useCallback(() => {
    setModalState(null)
    setValidationError(false)
  }, [])

  // ========================================================================= Command Handlers...

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

    // Save command to flow
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

    // Validate: only block when editing and keyword changed to an existing one
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

  // ========================================================================= Delete Handlers...

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

  // ========================================================================= Reordering & Sending...

  const handleReorderCommonCommands = (reorderedCommands: AdbCommand[]) => {
    setConfig((prev) => ({ ...prev, commonCommands: reorderedCommands }))
    window.configAPI.updateCommonCommands(reorderedCommands)
  }

  // Persist project-command order (C4 unified list). Previously the command
  // table reordered in local state only, so drags were lost on reload.
  const handleReorderCommands = (reorderedCommands: AdbCommand[]) => {
    if (!project) return
    const updatedProject = { ...project, commands: reorderedCommands }
    setProject(updatedProject)
    window.projectAPI.saveProject(updatedProject)
  }

  // Every ADB command in the app runs through here — command rows, dock rows, the command bar, and each flow step — which makes it the one...
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

  // ========================================================================= Flow Handlers...

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

  // 21a: flow cards render in stored array order, and until now the only way to
  // change it was editing the `flows` array in `{id}.project.json` by hand.
  const handleReorderFlows = (reorderedFlows: Flow[]) => {
    if (!project) return
    const updatedProject = { ...project, flows: reorderedFlows }
    setProject(updatedProject)
    window.projectAPI.saveProject(updatedProject)
  }

  // 21b: dropping a dock command onto a flow card appends a *copy* — the global library entry stays where it is, and the flow gets its own...
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

  // ========================================================================= Flow Execution...

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
        // Publish which command is executing so the flow card can mark rows
        // done / running / queued (C5 per-row status).
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
      // Flow execution error
    } finally {
      setIsFlowRunning(false)
      setRunningFlowId(null)
      setRunningCommandIndex(null)
      setAbortController(null)
    }
  }

  // ========================================================================= Utility Handlers...

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

  // Both device actions report through the status bar's last-run readout (area 25), the same slot `handleSendCommand` writes.
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
        // Whatever happened, no routine is running now.
        setProvisionProgress(null)
      }
    },
    []
  )

  const handleResetClient = useCallback(
    () => void runDeviceAction('Reset client', () => window.adbAPI.executeApplicationReset()),
    [runDeviceAction]
  )

  // A clear carries its routine's outcome (28a's `ClearStorageResult.provision`).
  const handleClearStorage = useCallback(async () => {
    const result = await runDeviceAction('Clear storage', () => window.adbAPI.clearStorage())
    if (result?.provision && !result.provision.success) {
      setProvisionFailure({
        result: result.provision,
        lead: 'Storage was cleared, but provisioning failed — the client was left stopped rather than relaunched half-provisioned.'
      })
    }
  }, [runDeviceAction])

  // The steps alone — no force-stop, no relaunch. Reset client is one click away
  // in the same control, so pairing them is the user's call (area 28).
  const handleRunProvision = useCallback(async () => {
    const result = await runDeviceAction('Provisioning', () => window.provisionAPI.run())
    if (result && !result.success) setProvisionFailure({ result })
  }, [runDeviceAction])

  // Dock collapse — state lives in config (persisted across sessions, C1b).
  const dockCollapsed = config.dockCollapsed ?? false

  const handleToggleDock = useCallback(() => {
    const next = !dockCollapsed
    setConfig((prev) => ({ ...prev, dockCollapsed: next }))
    // Persist outside the state updater so a rejected/absent IPC can never
    // throw during render and take down the tree.
    void window.configAPI.updateDockCollapsed(next)
  }, [dockCollapsed])

  // Render

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

  // Live flow progress for the status bar (C8). `runningCommandIndex` is the
  // 0-based position the run loop is on; the bar reads it as `step X/Y`.
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
      /* Content, not presence (§1.12): the gate is whether there is a routine at all. */
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
        {/* Spans the dock and the routed screen, because 21's drags cross
            between them (see `shellDndContext.tsx`). */}
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

      {/* Modals — 3 instances instead of 7 */}
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

      {/* Outside the shell like the other three: a routine can be started from
          any client route, and the report is about the device rather than the
          screen that launched it. */}
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

// Routed screens — thin wrappers that read shell context and render the existing screen internals (redesign C1a: internals unchanged this...

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

// D7: the only screen not gated on a device, so it reads nothing off the shell
// context — its own provider supplies everything it needs.
export function SyncScreen() {
  return <SyncTab />
}

// 18a: Settings moved under the layout route, so it's a routed screen like the
// rest rather than a sibling of the whole shell.
export function SettingsScreen() {
  const s = useShellContext()
  return (
    <SettingsTab
      config={s.config}
      onConfigChanged={s.reloadConfig}
      // 18b2: the Common commands section drives the same handlers the dock
      // does — the dock is hidden on this route, not the editing path.
      onAddCommonCommand={() => s.handleAddCommand(true, undefined, 'barcode')}
      onEditCommonCommand={(command) => s.handleEditCommand(command, true)}
      onDeleteCommonCommand={s.handleShowDeleteCommonCommand}
      onReorderCommonCommands={s.handleReorderCommonCommands}
    />
  )
}

// Layout route element: shared state + shell chrome.
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

import { cn } from '@/lib/utils'
import { ProvisionStep, ProvisionStepType } from '@/types'
import { Clock, ShieldCheck, Terminal, Upload } from 'lucide-react'

// Shared vocabulary for the four provisioning step types (area 28b1) — the editor modal and the step list both render it, and two copies...

export const PROVISION_TYPES: readonly { value: ProvisionStepType; label: string }[] = [
  { value: 'shell', label: 'Shell' },
  { value: 'push', label: 'Push' },
  { value: 'grant', label: 'Grant' },
  { value: 'wait', label: 'Wait' }
]

const ICONS = {
  shell: Terminal,
  push: Upload,
  grant: ShieldCheck,
  wait: Clock
} as const

export function ProvisionTypeIcon({
  type,
  className,
  size = 14
}: {
  type: ProvisionStepType
  className?: string
  size?: number
}) {
  const Icon = ICONS[type]
  return <Icon size={size} className={cn('flex-shrink-0', className)} aria-hidden />
}

/** How a step reads when it has no label of its own — the renderer's half of `describeStep` in `provisionManager`, which is what progress... */
export function describeStep(step: ProvisionStep): string {
  switch (step.type) {
    case 'shell':
      return step.command
    case 'push':
      return `${step.source} → ${step.destination}`
    case 'grant':
      return `${step.permissions.length} permission${step.permissions.length === 1 ? '' : 's'}`
    case 'wait':
      return `${step.durationMs}ms`
  }
}

/** The flags a row shows as chips — the two opt-ins that change how a step runs. */
export function stepFlags(step: ProvisionStep): string[] {
  if (step.type === 'shell' && step.continueOnError) return ['continue on error']
  if (step.type === 'push' && step.sync) return ['--sync']
  return []
}

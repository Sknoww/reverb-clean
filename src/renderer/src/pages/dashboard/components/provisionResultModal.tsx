import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ProvisionResult, ProvisionStepResult } from '@/types'
import { TriangleAlert } from 'lucide-react'
import { useRef } from 'react'
import { MODAL_CONTENT, ModalBody, ModalHeader } from './modalShell'
import { ProvisionTypeIcon } from './provisionStepMeta'

// The failure report for a provisioning run (area 28b2), on C7's chrome (§1.8).

/** `steps` is empty when the routine refused before running anything. */
function StepRow({ step }: { step: ProvisionStepResult }) {
  // `continued` is its own state, not a third success value: the step failed and `continueOnError` let the routine carry on, which the...
  const glyph = step.success ? '✓' : step.continued ? '!' : '✕'
  const tone = step.success ? 'text-success' : step.continued ? 'text-stale' : 'text-red-300'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className={cn('w-3 flex-shrink-0 text-center font-mono text-[13px]', tone)}
          aria-hidden
        >
          {glyph}
        </span>
        <ProvisionTypeIcon type={step.type} className="text-glyph-dim" />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
          {step.label}
        </span>
        <span className="flex-shrink-0 font-mono text-[11px] text-text-dim">
          {step.durationMs < 1000
            ? `${step.durationMs}ms`
            : `${(step.durationMs / 1000).toFixed(1)}s`}
        </span>
      </div>

      {/* **Two kinds of text, and the typeface is what separates them** — 28b1's
          finding one chunk on, caught the same way, by looking at a screenshot.
          `classify` sets `error` to the raw device output for a `shell` or `push`
          failure and to a sentence of the app's own for a timeout, a spawn
          failure or a partial `grant`. Rendering both as prose put a
          `cat: … No such file or directory` in the proportional font directly
          under a mono step label — the same machine value in two typefaces.
          So the comparison against `output` does double duty: it decides whether
          there is a sentence to print *and* whether this step's output is the
          error rather than context for it. */}
      {!step.success && step.error && step.error !== step.output && (
        <p className="pl-5 text-xs leading-snug text-red-300">{step.error}</p>
      )}

      {/* The well: raw device output, or a `grant`'s per-permission ✓/✕ list —
          28a keeps attempting after the first refusal, so it knows about all of
          them. Mono on `surface-chrome`, C6's result-card treatment (§1.7),
          tinted red only when the output *is* the failure. */}
      {!step.success && step.output && (
        <pre
          className={cn(
            'ml-5 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-hairline bg-surface-chrome px-3 py-2 font-mono text-[11px] leading-relaxed',
            step.output === step.error ? 'text-red-300' : 'text-muted-foreground'
          )}
        >
          {step.output}
        </pre>
      )}
    </div>
  )
}

export function ProvisionResultModal({
  isOpen,
  onClose,
  result,
  /** What the run was part of, when it wasn't the standalone action. */
  lead
}: {
  isOpen: boolean
  onClose: () => void
  result: ProvisionResult
  lead?: string
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  const handleOpenLogs = async () => {
    // The same two calls Settings' Logging row makes (18a) — the full transcript is already in the log, and a dialog that says so without a...
    const directory = await window.loggerAPI.getLogsDirectory()
    if (directory) await window.dialogAPI.openInEditor(directory)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={MODAL_CONTENT}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          closeRef.current?.focus()
        }}
      >
        <ModalHeader
          marker={<TriangleAlert className="h-3.5 w-3.5 flex-shrink-0 text-red-400" aria-hidden />}
          title="Provisioning failed"
          onClose={onClose}
        />
        {/* A refusal ran nothing, so promising a step list would describe a body
            that isn't there — the one reader who can't see that for themselves
            is the one this text is for. */}
        <DialogDescription className="sr-only">
          {result.steps.length === 0
            ? 'The provisioning routine refused to start. The reason follows.'
            : 'The provisioning routine stopped before finishing. Each step it ran is listed with its outcome.'}
        </DialogDescription>

        <ModalBody>
          {lead && <p className="text-[13px] leading-relaxed text-muted-foreground">{lead}</p>}

          {/* A refusal has no steps at all — nothing ran, and 28a's message
              already names the section to go to. It is the whole body here. */}
          {result.steps.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-red-300">{result.error}</p>
          ) : (
            <>
              {/* Says only what is true of *every* failed run: where it stopped,
                  and that the rest didn't run. **What it deliberately doesn't
                  claim is that the client was left stopped** — that is the
                  clear's `lead`, because a standalone run never stops anything,
                  and a report that says otherwise describes an action the user
                  didn't take. */}
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Step {(result.failedIndex ?? result.steps.length - 1) + 1} stopped the routine — the
                steps after it did not run.
              </p>
              <div className="flex flex-col gap-3">
                {result.steps.map((step) => (
                  <StepRow key={`${step.id}-${step.index}`} step={step} />
                ))}
              </div>
            </>
          )}
        </ModalBody>

        <DialogFooter className="flex-row items-center justify-between gap-2.5 space-x-0 border-t border-hairline px-5 pb-[18px] pt-3.5 sm:space-x-0">
          <button
            type="button"
            onClick={() => void handleOpenLogs()}
            className="text-xs text-glyph-dim underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
          >
            Open logs
          </button>
          <Button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="h-[38px] rounded-[9px] px-[18px] text-[13px] font-medium shadow-none"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { SyncPlan, SyncPlanItem } from '@/types'
import { ArrowUpDown, Loader2, TriangleAlert } from 'lucide-react'
import { useRef } from 'react'
import { MODAL_CONTENT, ModalBody, ModalHeader } from './modalShell'

function tail(value: string, segments = 3): string {
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= segments) return value
  return `…/${parts.slice(-segments).join('/')}`
}

function shortVersion(fileName: string | null): string {
  if (!fileName) return ''
  const match = /_(\d{4})_(\d{2})_(\d{2})(?:_(\d+))?\.[^.]*$/.exec(fileName)
  if (!match) return ''
  const [, , month, day, revision] = match
  return `${month}_${day}${revision ? `_${revision}` : ''}`
}

function DiffHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="border-y border-hairline bg-surface-panel px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-glyph-dim first:border-t-0">
      {label} · {count}
    </div>
  )
}

function BumpRow({ item }: { item: SyncPlanItem }) {
  return (
    <div className="flex items-baseline gap-2 px-3 py-1.5">
      <span className="text-stale">↑</span>
      <span className="min-w-0 flex-1 truncate text-foreground" title={item.zone}>
        {item.zone}
      </span>
      <span className="flex-shrink-0 text-glyph-dimmer">{shortVersion(item.fromFileName)}</span>
      <span className="flex-shrink-0 text-glyph-dim">→</span>
      <span className="flex-shrink-0 text-stale">{shortVersion(item.toFileName)}</span>
    </div>
  )
}

function SimpleRow({ item, glyph, tone }: { item: SyncPlanItem; glyph: string; tone: string }) {
  return (
    <div className="flex gap-2 px-3 py-1.5">
      <span className={tone}>{glyph}</span>
      <span className="min-w-0 truncate text-foreground" title={item.zone}>
        {item.zone}
      </span>
    </div>
  )
}

interface SyncApplyModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  plan: SyncPlan | null
  planning: boolean
  planError: string | null
  applying: boolean
  applyError: string | null
}

export function SyncApplyModal({
  isOpen,
  onClose,
  onConfirm,
  plan,
  planning,
  planError,
  applying,
  applyError
}: SyncApplyModalProps) {
  const total = plan ? plan.adds.length + plan.removes.length + plan.bumps.length : 0
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !applying && onClose()}>
      <DialogContent
        className={MODAL_CONTENT}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <ModalHeader
          marker={<ArrowUpDown className="h-3.5 w-3.5 text-accent-indigo" aria-hidden />}
          title={planning ? 'Apply changes' : `Apply ${total} change${total === 1 ? '' : 's'}`}
          onClose={onClose}
        />
        <DialogDescription className="sr-only">
          Review the adds, removes, and version bumps before writing your local YAML.
        </DialogDescription>

        <ModalBody>
          {planError ? (
            <p className="text-[13px] leading-relaxed text-red-300">{planError}</p>
          ) : planning || !plan ? (
            <div className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Building the preview…
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Writing to</span>
                <div
                  title={plan.targetFile}
                  className="flex min-h-10 items-center truncate rounded-[9px] border border-border-control bg-surface-control px-3 font-mono text-xs text-foreground"
                >
                  {tail(plan.targetFile)}
                </div>
                <span className="text-[11px] text-glyph-dim">
                  Comments, ordering, and formatting are preserved — only the deployment paths
                  change.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Changes</span>
                <div className="overflow-hidden rounded-[9px] border border-hairline bg-surface-chrome font-mono text-xs">
                  {plan.bumps.length > 0 && (
                    <>
                      <DiffHeading label="Version bumps" count={plan.bumps.length} />
                      {plan.bumps.map((item) => (
                        <BumpRow key={item.zone} item={item} />
                      ))}
                    </>
                  )}
                  {plan.adds.length > 0 && (
                    <>
                      <DiffHeading label="Added" count={plan.adds.length} />
                      {plan.adds.map((item) => (
                        <SimpleRow
                          key={item.zone}
                          item={item}
                          glyph="＋"
                          tone="text-mono-keyword"
                        />
                      ))}
                    </>
                  )}
                  {plan.removes.length > 0 && (
                    <>
                      <DiffHeading label="Removed" count={plan.removes.length} />
                      {plan.removes.map((item) => (
                        <SimpleRow key={item.zone} item={item} glyph="−" tone="text-red-300" />
                      ))}
                    </>
                  )}
                  {total === 0 && (
                    <div className="px-3 py-3 text-glyph-dim">
                      Nothing to write — the local YAML already matches your selection.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-[9px] border border-hairline bg-surface-panel px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <TriangleAlert
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-stale"
                  aria-hidden
                />
                <span>
                  This file is local-only and untracked
                  {plan.branch && (
                    <>
                      {' '}
                      (checkout is on{' '}
                      <span className="font-mono text-foreground">{plan.branch}</span>)
                    </>
                  )}
                  , so git can&rsquo;t restore it. A timestamped backup is written alongside it
                  before each apply, and the last{' '}
                  <span className="font-mono text-text-dim">{plan.backupKeep}</span> are kept.
                </span>
              </div>

              {applyError && (
                <p role="alert" className="text-xs leading-relaxed text-red-300">
                  {applyError} Nothing was written.
                </p>
              )}
            </>
          )}
        </ModalBody>

        <DialogFooter className="flex-row items-center justify-end gap-2.5 space-x-0 border-t border-hairline px-5 pb-[18px] pt-3.5 sm:space-x-0">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={applying}
            className="h-[38px] rounded-[9px] border-border-control bg-transparent px-4 text-[13px] text-zinc-300 shadow-none hover:bg-row-hover hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={applying || planning || !plan || total === 0}
            className={cn(
              'h-[38px] gap-2 rounded-[9px] px-[18px] text-[13px] font-medium shadow-none',
              applying && 'opacity-60'
            )}
          >
            {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {applying ? 'Writing…' : 'Write local YAML'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

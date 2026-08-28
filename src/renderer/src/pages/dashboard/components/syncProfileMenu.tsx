import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { SyncProfile } from '@/types'
import { Check, ChevronDown, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useSyncContext } from '../contexts/syncContext'
import { SyncProfileDeleteModal, SyncProfileFormModal } from './syncProfileModal'

// The profile switcher (S3, frames 6b + 6f).

/** The dirty marker — a state, not an error; the same `stale` token as bumps. */
function ModifiedBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        'flex-shrink-0 text-[10px] font-semibold uppercase tracking-[0.04em] text-stale',
        !compact && 'rounded-[5px] bg-stale/[0.12] px-1.5 py-0.5'
      )}
    >
      Modified
    </span>
  )
}

function ProfileRow({
  profile,
  active,
  dirty,
  missing,
  onSelect,
  onRename,
  onDelete
}: {
  profile: SyncProfile
  active: boolean
  dirty: boolean
  missing: number
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    // The highlight sits on the row, not the item, so it runs under the `⋯`
    // peer as well — half a highlighted row reads as a rendering bug.
    <div className={cn('flex items-center rounded-sm', active && 'bg-nav-active')}>
      <DropdownMenuItem
        onSelect={onSelect}
        className="min-w-0 flex-1 cursor-pointer gap-2.5 pr-1.5 text-[13px] focus:bg-row-hover"
      >
        <span className="flex w-3 flex-shrink-0 justify-center text-mono-keyword">
          {active && <Check className="h-3 w-3" aria-hidden />}
        </span>
        <span
          className={cn('min-w-0 flex-1 truncate', active ? 'text-foreground' : 'text-zinc-300')}
          title={profile.name}
        >
          {profile.name}
        </span>
        <span className="flex-shrink-0 font-mono text-[11px] text-glyph-dim">
          {profile.zones.length}
        </span>
        {active && dirty && <ModifiedBadge compact />}
        {/* A count, not an error: a zone can go missing on any branch switch. */}
        {missing > 0 && (
          <span
            className="flex-shrink-0 text-[11px] text-glyph-dim"
            title={`${missing} zone${missing === 1 ? '' : 's'} in this profile ${
              missing === 1 ? 'is' : 'are'
            } not in the current scan`}
          >
            {missing} missing
          </span>
        )}
      </DropdownMenuItem>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          aria-label={`Manage ${profile.name}`}
          className="w-8 flex-shrink-0 justify-center px-0 text-glyph-dim data-[state=open]:text-foreground [&>svg:last-child]:hidden"
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem className="cursor-pointer text-[13px]" onSelect={onRename}>
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer text-[13px] text-red-300" onSelect={onDelete}>
            Delete…
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </div>
  )
}

export function SyncProfileMenu() {
  const {
    profiles,
    activeProfile,
    profileDirty,
    missingZones,
    selectProfile,
    saveActiveProfile,
    revertToProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    detachProfile,
    profileNotice,
    selected
  } = useSyncContext()

  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<SyncProfile | null>(null)
  const [deleting, setDeleting] = useState<SyncProfile | null>(null)

  const names = (except?: string) =>
    profiles.filter((profile) => profile.id !== except).map((profile) => profile.name)

  return (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={
                activeProfile ? `Profile: ${activeProfile.name}` : 'No profile — ad-hoc selection'
              }
              className="flex h-[34px] min-w-0 items-center gap-2 rounded-[9px] border border-border-control bg-surface-control px-2.5 transition-colors hover:bg-row-hover data-[state=open]:border-border-bar data-[state=open]:bg-nav-active"
            >
              <span
                className={cn(
                  'min-w-0 max-w-[180px] truncate text-[13px]',
                  activeProfile ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {activeProfile?.name ?? 'Ad-hoc selection'}
              </span>
              {activeProfile && profileDirty && <ModifiedBadge />}
              <ChevronDown className="h-3 w-3 flex-shrink-0 text-glyph-dim" aria-hidden />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-72" align="start">
            {profiles.length > 0 ? (
              <>
                <div className="px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-glyph-dim">
                  Profiles
                </div>
                {profiles.map((profile) => (
                  <ProfileRow
                    key={profile.id}
                    profile={profile}
                    active={profile.id === activeProfile?.id}
                    dirty={profileDirty}
                    missing={missingZones(profile).length}
                    onSelect={() => void selectProfile(profile.id)}
                    onRename={() => setRenaming(profile)}
                    onDelete={() => setDeleting(profile)}
                  />
                ))}
                <DropdownMenuSeparator />
              </>
            ) : (
              <div className="px-3 py-2.5 text-[11px] leading-relaxed text-glyph-dim">
                No profiles yet. Profiles are optional — the breadcrumb just reads the working set.
              </div>
            )}

            {activeProfile && profileDirty && (
              <>
                <DropdownMenuItem
                  className="cursor-pointer text-[13px]"
                  onSelect={() => void saveActiveProfile()}
                >
                  Save changes to “{activeProfile.name}”
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-[13px] text-zinc-300"
                  onSelect={revertToProfile}
                >
                  Revert to saved
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              className="cursor-pointer text-[13px] text-zinc-300"
              onSelect={() => setCreating(true)}
            >
              Save selection as new profile…
            </DropdownMenuItem>
            {activeProfile && (
              <DropdownMenuItem
                className="cursor-pointer text-[13px] text-zinc-300"
                onSelect={() => void detachProfile()}
              >
                Work ad-hoc
                <span className="ml-1.5 text-glyph-dim">keeps the selection</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Frame 6b's quiet peers — the same two actions the menu leads with,
            one click closer while the selection is dirty. */}
        {activeProfile && profileDirty && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void saveActiveProfile()}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Save
            </button>
            <span className="text-border-bar" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={revertToProfile}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Revert
            </button>
          </div>
        )}

        {profileNotice && (
          <span className="flex-shrink-0 truncate text-xs text-muted-foreground">
            {profileNotice}
          </span>
        )}
      </div>

      <SyncProfileFormModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onSubmit={(name) => {
          void createProfile(name)
          setCreating(false)
        }}
        zones={[...selected]}
        title="Save profile"
        submitLabel="Save profile"
        takenNames={names()}
      />

      <SyncProfileFormModal
        isOpen={renaming !== null}
        onClose={() => setRenaming(null)}
        onSubmit={(name) => {
          if (renaming) void renameProfile(renaming.id, name)
          setRenaming(null)
        }}
        initialName={renaming?.name ?? ''}
        title="Rename profile"
        submitLabel="Rename"
        takenNames={names(renaming?.id)}
      />

      <SyncProfileDeleteModal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void deleteProfile(deleting.id)
          setDeleting(null)
        }}
        profileName={deleting?.name ?? ''}
        zoneCount={deleting?.zones.length ?? 0}
      />
    </>
  )
}

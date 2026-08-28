import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useNavigationLock } from '@/lib/utils'
import { LuEllipsis } from 'react-icons/lu'

interface ContextMenuProps {
  onOpenProjectFile?: () => void
  hasProject?: boolean
}

export function ContextMenu({ onOpenProjectFile, hasProject }: ContextMenuProps) {
  const { safeNavigate } = useNavigationLock()

  const handleNavigateToSettings = () => {
    safeNavigate('/settings')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* C2: a bordered 34px square with a horizontal ⋯ — a peer of the device pill and Reset client in the top bar's right cluster, not a... */}
        <button
          type="button"
          aria-label="More actions"
          title="More actions"
          className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] border border-border-control text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
        >
          <LuEllipsis size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={onOpenProjectFile}
            disabled={!hasProject}
          >
            Edit Project JSON
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem className="cursor-pointer" onClick={handleNavigateToSettings}>
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

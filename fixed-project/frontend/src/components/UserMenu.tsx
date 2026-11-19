import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronsUpDown, LogOut, Settings } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface UserMenuProps {
  email: string
  onSignOut: () => void
  isAdmin?: boolean
}

function getInitials(email: string): string {
  const name = email.split('@')[0]
  const parts = name.split(/[._-]/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function getDisplayName(email: string): string {
  const name = email.split('@')[0]
  return name
    .split(/[._-]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Account button at the bottom of the sidebar; opens a menu with Settings (admins) and Log out */
export function UserMenu({ email, onSignOut, isAdmin = false }: UserMenuProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const navigate = useNavigate()

  const initials = getInitials(email)
  const displayName = getDisplayName(email)

  function handleOpenSettings() {
    setPopoverOpen(false)
    navigate('/settings')
  }

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-accent'

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent">
          {/* Ink monogram instead of a random-color avatar */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-[11px] font-medium text-background">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{email}</p>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5" align="start" side="top">
        {isAdmin && (
          <button className={itemClass} onClick={handleOpenSettings}>
            <Settings className="h-4 w-4 text-muted-foreground" />
            Settings
          </button>
        )}
        <button className={itemClass} onClick={onSignOut}>
          <LogOut className="h-4 w-4 text-muted-foreground" />
          Log out
        </button>
      </PopoverContent>
    </Popover>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, MessagesSquare, Library, X } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { UserMenu } from '@/components/UserMenu'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

type Section = 'chat' | 'documents' | 'settings'

interface AppShellProps {
  active: Section
  /** Optional content placed between the nav and the user menu (e.g. the thread list) */
  sidebar?: ReactNode
  /** When this value changes (e.g. a thread is picked), the mobile drawer closes */
  navKey?: unknown
  children: ReactNode
}

/**
 * Shared layout: paper sidebar (brand, nav, optional content, user menu) + main pane.
 * Below the md breakpoint the sidebar becomes an off-canvas drawer.
 */
export function AppShell({ active, sidebar, navKey, children }: AppShellProps) {
  const { user, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close the mobile drawer after an in-sidebar selection (e.g. choosing a conversation)
  useEffect(() => {
    setDrawerOpen(false)
  }, [navKey])

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Failed to sign out:', error)
    }
  }

  const go = (path: string) => {
    setDrawerOpen(false)
    navigate(path)
  }

  // Labels stay "Chat" / "Documents" (the E2E suite clicks them by name)
  const navItems: { key: Section; label: string; path: string; icon: typeof Library }[] = [
    { key: 'chat', label: 'Chat', path: '/', icon: MessagesSquare },
    { key: 'documents', label: 'Documents', path: '/documents', icon: Library },
  ]

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* Mobile scrim */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 backdrop-blur-[1px] md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r bg-sidebar transition-transform duration-200 md:static md:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <button onClick={() => go('/')} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Brand />
          </button>
          <button
            className="rounded-md p-1 text-muted-foreground hover:text-foreground md:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="px-3">
          <ul className="space-y-0.5">
            {navItems.map(({ key, label, path, icon: Icon }) => (
              <li key={key}>
                <button
                  onClick={() => go(path)}
                  aria-current={active === key ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    active === key
                      ? 'bg-card font-medium text-foreground shadow-[0_1px_0_hsl(var(--border))]'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className={cn('h-4 w-4', active === key && 'text-primary')} />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-5 my-4 border-t" />

        <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>

        <div className="border-t p-3">
          {user?.email && (
            <UserMenu email={user.email} onSignOut={handleSignOut} isAdmin={isAdmin} />
          )}
        </div>
      </aside>

      {/* Main pane */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b px-4 py-3 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Brand />
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  )
}

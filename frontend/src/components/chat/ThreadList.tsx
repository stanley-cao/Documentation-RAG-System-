import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listThreads, createThread, deleteThread } from '@/lib/api'
import type { Thread } from '@/types'
import { cn } from '@/lib/utils'

interface ThreadListProps {
  selectedThreadId: string | null
  onSelectThread: (threadId: string) => void
}

export interface ThreadListRef {
  updateThreadTitle: (threadId: string, title: string) => void
  addThread: (thread: Thread) => void
}

type GroupLabel = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Earlier'
const GROUP_ORDER: GroupLabel[] = ['Today', 'Yesterday', 'Previous 7 days', 'Earlier']

/** Bucket a thread by how recently it was updated (local time) */
function groupFor(dateIso: string, now: Date = new Date()): GroupLabel {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 24 * 60 * 60 * 1000
  const t = new Date(dateIso).getTime()
  if (t >= startOfToday) return 'Today'
  if (t >= startOfToday - day) return 'Yesterday'
  if (t >= startOfToday - 7 * day) return 'Previous 7 days'
  return 'Earlier'
}

export const ThreadList = forwardRef<ThreadListRef, ThreadListProps>(
  function ThreadList({ selectedThreadId, onSelectThread }, ref) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useImperativeHandle(ref, () => ({
    updateThreadTitle: (threadId: string, title: string) => {
      setThreads(prev => prev.map(t =>
        t.id === threadId ? { ...t, title } : t
      ))
    },
    addThread: (thread: Thread) => {
      setThreads(prev => [thread, ...prev])
    }
  }))

  const loadThreads = async () => {
    try {
      const data = await listThreads()
      setThreads(data)
    } catch (error) {
      console.error('Failed to load threads:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadThreads()
  }, [])

  const handleCreateThread = async () => {
    setCreating(true)
    try {
      const newThread = await createThread()
      setThreads(prev => [newThread, ...prev])
      onSelectThread(newThread.id)
    } catch (error) {
      console.error('Failed to create thread:', error)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation()
    try {
      await deleteThread(threadId)
      setThreads(prev => prev.filter(t => t.id !== threadId))
      if (selectedThreadId === threadId) {
        onSelectThread('')
      }
    } catch (error) {
      console.error('Failed to delete thread:', error)
    }
  }

  // Group threads (already sorted newest-first by the API) into date buckets
  const groups = GROUP_ORDER
    .map(label => ({ label, items: threads.filter(t => groupFor(t.updated_at) === label) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-3">
        <Button
          onClick={handleCreateThread}
          disabled={creating}
          variant="outline"
          className="w-full justify-start border-dashed bg-transparent text-muted-foreground hover:border-solid hover:bg-card hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          {creating ? 'Creating...' : 'New Chat'}
        </Button>
      </div>

      <div className="scrollbar-quiet flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="space-y-2 px-2 pt-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-4 animate-pulse rounded bg-accent" style={{ width: `${80 - i * 15}%` }} />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <p className="px-2 pt-2 font-serif text-[15px] italic text-muted-foreground">
            No conversations yet. Ask your first question to begin.
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map(group => (
              <section key={group.label}>
                <h3 className="eyebrow mb-1.5 px-2">{group.label}</h3>
                <ul className="space-y-px">
                  {group.items.map(thread => {
                    const selected = selectedThreadId === thread.id
                    return (
                      <li
                        key={thread.id}
                        onClick={() => onSelectThread(thread.id)}
                        className={cn(
                          'group relative flex cursor-pointer items-center justify-between rounded-md py-1.5 pl-3 pr-1.5 text-[13.5px] transition-colors',
                          selected
                            ? 'bg-card text-foreground shadow-[0_1px_0_hsl(var(--border))]'
                            : 'text-foreground/80 hover:bg-accent hover:text-foreground'
                        )}
                      >
                        {/* Margin rule marks the open conversation */}
                        {selected && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
                        <span className="truncate">{thread.title}</span>
                        <button
                          className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={(e) => handleDeleteThread(e, thread.id)}
                          title="Delete conversation"
                          aria-label={`Delete ${thread.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

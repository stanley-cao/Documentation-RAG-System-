import { useState, useRef } from 'react'
import { ThreadList, ThreadListRef } from '@/components/chat/ThreadList'
import { ChatView } from '@/components/chat/ChatView'
import { Composer } from '@/components/chat/Composer'
import { AppShell } from '@/components/AppShell'
import { createThread } from '@/lib/api'

// Starter prompts on the empty state; clicking one starts a conversation with it
const SUGGESTIONS = [
  'Summarize my most recent document',
  'What topics do my documents cover?',
  'Find any dates or deadlines mentioned',
]

export function ChatPage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined)
  const [welcomeInput, setWelcomeInput] = useState('')
  const [creating, setCreating] = useState(false)
  const threadListRef = useRef<ThreadListRef>(null)

  const handleThreadTitleUpdate = (threadId: string, title: string) => {
    threadListRef.current?.updateThreadTitle(threadId, title)
  }

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId || null)
    setInitialMessage(undefined)
  }

  /** Create a thread and hand the first message to ChatView, which sends it */
  const startConversation = async (text: string) => {
    const message = text.trim()
    if (!message || creating) return
    setCreating(true)
    try {
      const newThread = await createThread()
      threadListRef.current?.addThread(newThread)
      setInitialMessage(message)
      setSelectedThreadId(newThread.id)
      setWelcomeInput('')
    } catch (error) {
      console.error('Failed to create thread:', error)
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppShell
      active="chat"
      navKey={selectedThreadId}
      sidebar={
        <ThreadList
          ref={threadListRef}
          selectedThreadId={selectedThreadId}
          onSelectThread={handleSelectThread}
        />
      }
    >
      {selectedThreadId ? (
        <ChatView
          threadId={selectedThreadId}
          onThreadTitleUpdate={handleThreadTitleUpdate}
          initialMessage={initialMessage}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-4 pb-16">
          <div className="fade-up w-full max-w-2xl">
            <p className="eyebrow mb-4">Your library, annotated</p>
            <h1 className="font-serif text-[clamp(2.25rem,5vw,3.25rem)] font-normal leading-[1.05] tracking-tight">
              Ask your documents.
            </h1>
            <p className="mt-3 max-w-lg text-[15px] text-muted-foreground">
              Margin searches what you've uploaded and answers from it, citing the file each detail came from.
            </p>

            <Composer
              className="mt-8"
              value={welcomeInput}
              onChange={setWelcomeInput}
              onSubmit={() => startConversation(welcomeInput)}
              disabled={creating}
              placeholder="Ask anything"
              autoFocus
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => startConversation(s)}
                  disabled={creating}
                  className="rounded-full border bg-transparent px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-highlight hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

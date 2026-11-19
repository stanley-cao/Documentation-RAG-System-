import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BrandMark } from '@/components/Brand'
import { Composer } from '@/components/chat/Composer'
import { getMessages, sendMessage, updateThread } from '@/lib/api'
import type { Message } from '@/types'

interface ChatViewProps {
  threadId: string
  onThreadTitleUpdate?: (threadId: string, title: string) => void
  initialMessage?: string
}

/** The user's question: set larger in the serif, with a green margin rule */
function UserTurn({ content }: { content: string }) {
  return (
    <div className="fade-up border-l-2 border-primary pl-4">
      <p className="eyebrow mb-1.5">You</p>
      <p className="whitespace-pre-wrap font-serif text-[20px] leading-snug tracking-tight">{content}</p>
    </div>
  )
}

/** Margin's answer: markdown rendered as editorial prose */
function AssistantTurn({ content }: { content: string }) {
  return (
    <div className="fade-up">
      <p className="eyebrow mb-2 flex items-center gap-1.5">
        <BrandMark className="h-3.5 w-3.5" />
        Margin
      </p>
      <div className="answer">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}

export function ChatView({ threadId, onThreadTitleUpdate, initialMessage }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const initialMessageSentRef = useRef(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent])

  useEffect(() => {
    let cancelled = false
    initialMessageSentRef.current = false
    setError(null)

    const loadMessages = async () => {
      setLoading(true)
      try {
        const data = await getMessages(threadId)
        if (!cancelled) {
          setMessages(data)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load messages:', error)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadMessages()
    return () => { cancelled = true }
  }, [threadId])

  const doSend = async (userMessage: string) => {
    if (!userMessage.trim() || sending) return

    const isFirstMessage = messages.length === 0
    setSending(true)
    setWaiting(true)
    setStreamingContent('')
    setError(null)

    abortControllerRef.current = new AbortController()

    // Show the question immediately; the server persists it
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      thread_id: threadId,
      user_id: '',
      openai_message_id: null,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMessage])

    // First message names the thread
    if (isFirstMessage && onThreadTitleUpdate) {
      const title = userMessage.length > 50
        ? userMessage.substring(0, 47) + '...'
        : userMessage
      try {
        await updateThread(threadId, title)
        onThreadTitleUpdate(threadId, title)
      } catch (error) {
        console.error('Failed to update thread title:', error)
      }
    }

    try {
      await sendMessage({
        threadId,
        content: userMessage,
        onTextDelta: (text) => {
          setWaiting(false)
          setStreamingContent(prev => prev + text)
        },
        onDone: () => {
          setSending(false)
          setWaiting(false)
          abortControllerRef.current = null
        },
        onError: (err) => {
          console.error('Stream error:', err)
          setError(err)
          setSending(false)
          setWaiting(false)
          abortControllerRef.current = null
        },
        signal: abortControllerRef.current.signal,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setSending(false)
        setWaiting(false)
      } else {
        console.error('Failed to send message:', err)
        setError((err as Error).message || 'Failed to send message')
        setSending(false)
        setWaiting(false)
      }
      abortControllerRef.current = null
    }
  }

  const handleSubmit = async () => {
    if (!input.trim() || sending) return
    const userMessage = input.trim()
    setInput('')
    await doSend(userMessage)
  }

  // Send the message typed on the welcome screen once history has loaded
  useEffect(() => {
    if (!loading && initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true
      doSend(initialMessage)
    }
  }, [loading, initialMessage])

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }

  // When streaming finishes, move the streamed text into the message list
  useEffect(() => {
    if (!sending && streamingContent) {
      setMessages(prev => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          thread_id: threadId,
          user_id: '',
          openai_message_id: null,
          role: 'assistant',
          content: streamingContent,
          created_at: new Date().toISOString(),
        } as Message,
      ])
      setStreamingContent('')
    }
  }, [sending, streamingContent, threadId])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isEmpty = messages.length === 0 && !streamingContent && !waiting && !error

  return (
    <div className="flex h-full flex-col">
      {/* Conversation */}
      <div className="scrollbar-quiet flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center px-4">
            <p className="font-serif text-[28px] italic text-muted-foreground">What would you like to know?</p>
          </div>
        ) : (
          <div className="mx-auto max-w-[44rem] px-5 py-10 md:px-8">
            <div className="space-y-9">
              {messages.map(message =>
                message.role === 'user'
                  ? <UserTurn key={message.id} content={message.content} />
                  : <AssistantTurn key={message.id} content={message.content} />
              )}

              {/* Waiting for the first token (model may be searching documents) */}
              {waiting && !streamingContent && (
                <div className="fade-up flex items-center gap-3 text-muted-foreground">
                  <span className="dot-pulse flex gap-1" aria-hidden="true">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  <span className="font-serif text-[15px] italic">Reading your documents…</span>
                </div>
              )}

              {streamingContent && <AssistantTurn content={streamingContent} />}

              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Message box */}
      <div className="bg-gradient-to-t from-background via-background to-background/0 pt-2">
        <div className="mx-auto max-w-[44rem] px-5 pb-5 md:px-8">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            sending={sending}
            onStop={handleStop}
            placeholder="Ask a follow-up"
          />
          <p className="mt-2 text-center font-mono text-[10.5px] text-muted-foreground/80">
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </div>
    </div>
  )
}

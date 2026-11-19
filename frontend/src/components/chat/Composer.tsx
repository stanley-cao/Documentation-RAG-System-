import { useEffect, useRef } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** True while a reply is streaming: shows the stop button */
  sending?: boolean
  onStop?: () => void
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

const MAX_HEIGHT_PX = 200

/**
 * Message box: auto-growing textarea on a paper "sheet".
 * Enter sends, Shift+Enter inserts a newline.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  sending = false,
  onStop,
  disabled = false,
  placeholder = 'Ask anything',
  autoFocus = false,
  className,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow with content up to MAX_HEIGHT_PX, then scroll
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }, [value])

  const canSend = value.trim().length > 0 && !disabled && !sending

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ignore Enter while an IME composition is active (e.g. Japanese input)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSend) onSubmit()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) onSubmit()
      }}
      className={cn(
        'flex items-end gap-2 rounded-xl border border-input bg-card p-2 pl-4 shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.12)] transition-colors focus-within:border-primary/50',
        className
      )}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label="Message"
        className="scrollbar-quiet max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-60"
      />
      {sending ? (
        <button
          type="button"
          onClick={onStop}
          title="Stop generating"
          aria-label="Stop generating"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-85"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          title="Send"
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:translate-y-px disabled:bg-muted disabled:text-muted-foreground"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </form>
  )
}

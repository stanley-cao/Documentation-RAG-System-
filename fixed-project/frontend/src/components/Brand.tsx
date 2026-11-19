import { cn } from '@/lib/utils'

interface MarkProps {
  className?: string
}

/** Margin logo mark: a page with a ruled margin line and a note dot. Inherits theme colors. */
export function BrandMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn('h-6 w-6', className)}>
      <rect x="5" y="3" width="22" height="26" rx="3" className="fill-card stroke-foreground" strokeWidth="2" />
      <line x1="11.5" y1="3" x2="11.5" y2="29" className="stroke-primary" strokeWidth="2" />
      <line x1="15" y1="11" x2="23" y2="11" className="stroke-foreground" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="16" x2="23" y2="16" className="stroke-foreground" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="21" x2="20" y2="21" className="stroke-foreground" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11.5" cy="11" r="2.5" className="fill-primary" />
    </svg>
  )
}

/** Mark + serif wordmark */
export function Brand({ className }: MarkProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="font-serif text-[22px] font-medium leading-none tracking-tight">Margin</span>
    </div>
  )
}

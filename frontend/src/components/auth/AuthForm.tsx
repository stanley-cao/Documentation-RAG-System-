import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Brand } from '@/components/Brand'

// Short feature notes shown on the brand panel, styled like margin annotations
const NOTES = [
  { n: '01', text: 'Upload notes, manuals and reports as plain text or Markdown.' },
  { n: '02', text: 'Ask in plain language. Margin searches the passages that matter.' },
  { n: '03', text: 'Every answer names the file it came from.' },
]

export function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const { signIn, signUp } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    try {
      if (isSignUp) {
        await signUp(email, password)
        setMessage('Check your email for the confirmation link!')
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel (hidden on small screens) */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r bg-sidebar p-12 lg:flex">
        {/* Ruled-paper background with a margin line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 35px, hsl(var(--border)) 35px 36px)' }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[4.8rem] w-px bg-primary/40" />

        <Brand className="relative" />

        <div className="relative max-w-md pl-12">
          <h2 className="font-serif text-[44px] font-normal leading-[1.05] tracking-tight">
            Every answer, with its source in the margin.
          </h2>
          <ol className="mt-10 space-y-5">
            {NOTES.map(note => (
              <li key={note.n} className="flex gap-4">
                <span className="font-mono text-[11px] leading-6 text-primary">{note.n}</span>
                <span className="text-[15px] leading-6 text-muted-foreground">{note.text}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="relative pl-12 font-mono text-[11px] text-muted-foreground">
          Retrieval-augmented chat over your own documents
        </p>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-5 py-12">
        <div className="fade-up w-full max-w-sm">
          <Brand className="mb-10 lg:hidden" />

          <p className="eyebrow mb-3">{isSignUp ? 'New account' : 'Welcome back'}</p>
          <h1 className="font-serif text-[34px] font-normal leading-tight tracking-tight">
            {isSignUp ? 'Create your library' : 'Sign in to Margin'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignUp
              ? 'Enter your email to create a new account.'
              : 'Enter your credentials to access your documents.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[13px] font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-[13px] font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-md border border-primary/30 bg-highlight px-3 py-2.5 text-sm text-foreground">
                {message}
              </div>
            )}

            {/* Button labels stay "Sign In" / "Sign Up" for the E2E suite */}
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError(null)
                setMessage(null)
              }}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </section>
    </div>
  )
}

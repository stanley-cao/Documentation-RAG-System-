import { useState, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AppShell } from '@/components/AppShell'
import { useAuth } from '@/hooks/useAuth'
import { getSettings, updateSettings, type GlobalSettings, type GlobalSettingsUpdate } from '@/lib/api'

/** One settings group: a numbered heading in the left column, fields on the right */
function SettingsSection({
  index,
  title,
  description,
  badge,
  children,
}: {
  index: string
  title: string
  description: ReactNode
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-5 border-t py-8 md:grid-cols-[13rem_1fr] md:gap-10">
      <div>
        <p className="font-mono text-[11px] text-primary">{index}</p>
        <h2 className="mt-1 font-serif text-[21px] leading-tight tracking-tight">{title}</h2>
        {badge}
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/** Label + control wrapper */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium">{label}</label>
      {children}
      {hint && <p className="font-mono text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Password-style input with a show/hide toggle (autofill-safe field names) */
function SecretInput({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input
        name={name}
        type={shown ? 'text' : 'password'}
        autoComplete="off"
        placeholder="Enter API key"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="pr-10 font-mono text-[13px]"
      />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
        tabIndex={-1}
        disabled={disabled}
        aria-label={shown ? 'Hide API key' : 'Show API key'}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function SettingsPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasChunks, setHasChunks] = useState(false)

  // Form state
  const [llmModel, setLlmModel] = useState('')
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [embeddingModel, setEmbeddingModel] = useState('')
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState('')
  const [embeddingApiKey, setEmbeddingApiKey] = useState('')
  const [embeddingDimensions, setEmbeddingDimensions] = useState('')
  // Retrieval tuning (kept as strings while editing so the inputs can be cleared)
  const [similarityThreshold, setSimilarityThreshold] = useState('')
  const [topK, setTopK] = useState('')

  // Redirect non-admins to home (wait for loading to complete first)
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/')
    }
  }, [authLoading, isAdmin, navigate])

  useEffect(() => {
    if (isAdmin) {
      loadSettings()
    }
  }, [isAdmin])

  async function loadSettings() {
    setLoading(true)
    setError(null)
    try {
      const settings: GlobalSettings = await getSettings()
      setLlmModel(settings.llm_model || '')
      setLlmBaseUrl(settings.llm_base_url || '')
      setLlmApiKey(settings.llm_api_key || '')
      setEmbeddingModel(settings.embedding_model || '')
      setEmbeddingBaseUrl(settings.embedding_base_url || '')
      setEmbeddingApiKey(settings.embedding_api_key || '')
      setEmbeddingDimensions(settings.embedding_dimensions?.toString() || '')
      setSimilarityThreshold(settings.retrieval_similarity_threshold.toString())
      setTopK(settings.retrieval_top_k.toString())
      setHasChunks(settings.has_chunks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const update: GlobalSettingsUpdate = {
        llm_model: llmModel || null,
        llm_base_url: llmBaseUrl || null,
        llm_api_key: llmApiKey || null,
        embedding_model: embeddingModel || null,
        embedding_base_url: embeddingBaseUrl || null,
        embedding_api_key: embeddingApiKey || null,
        embedding_dimensions: embeddingDimensions ? parseInt(embeddingDimensions, 10) : null,
        // Empty input = leave unchanged (backend treats null as "no change")
        retrieval_similarity_threshold: similarityThreshold !== '' ? parseFloat(similarityThreshold) : null,
        retrieval_top_k: topK !== '' ? parseInt(topK, 10) : null,
      }
      const saved = await updateSettings(update)
      // Reflect the stored values (e.g. if a field was left blank)
      setSimilarityThreshold(saved.retrieval_similarity_threshold.toString())
      setTopK(saved.retrieval_top_k.toString())
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Show loading while auth is being checked
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <AppShell active="settings">
      <div className="scrollbar-quiet h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-5 py-10 md:px-8">
          <header className="fade-up mb-8">
            <p className="eyebrow mb-3">Administration</p>
            <h1 className="font-serif text-[40px] font-normal leading-none tracking-tight">Settings</h1>
            <p className="mt-3 max-w-lg text-[15px] text-muted-foreground">
              Models and search behaviour for everyone using this workspace. API keys are encrypted at rest.
            </p>
          </header>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading settings...
            </div>
          ) : (
            <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
              <SettingsSection
                index="01"
                title="LLM Configuration"
                description="The chat model that reads search results and writes answers. Any OpenAI-compatible endpoint works."
              >
                <Field label="Model Name">
                  <Input
                    name="llm-model-field"
                    autoComplete="off"
                    placeholder="e.g., gpt-4o, anthropic/claude-3.5-sonnet"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="font-mono text-[13px]"
                  />
                </Field>
                <Field label="Base URL">
                  <Input
                    name="llm-endpoint-field"
                    autoComplete="off"
                    placeholder="e.g., https://openrouter.ai/api/v1"
                    value={llmBaseUrl}
                    onChange={(e) => setLlmBaseUrl(e.target.value)}
                    className="font-mono text-[13px]"
                  />
                </Field>
                <Field label="API Key">
                  <SecretInput name="llm-key-field" value={llmApiKey} onChange={setLlmApiKey} />
                </Field>
              </SettingsSection>

              <SettingsSection
                index="02"
                title="Embedding Configuration"
                badge={hasChunks && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-[10.5px] text-warning">
                    <Lock className="h-3 w-3" />
                    Locked (chunks exist)
                  </span>
                )}
                description={hasChunks
                  ? 'Embedding settings cannot be changed while document chunks exist in the system. Delete all documents first to change these settings.'
                  : 'Turns passages and questions into vectors. Must stay the same for as long as documents are indexed with it.'}
              >
                <Field label="Model Name">
                  <Input
                    name="emb-model-field"
                    autoComplete="off"
                    placeholder="e.g., text-embedding-3-small"
                    value={embeddingModel}
                    onChange={(e) => setEmbeddingModel(e.target.value)}
                    disabled={hasChunks}
                    className="font-mono text-[13px]"
                  />
                </Field>
                <Field label="Base URL">
                  <Input
                    name="emb-endpoint-field"
                    autoComplete="off"
                    placeholder="e.g., https://api.openai.com/v1"
                    value={embeddingBaseUrl}
                    onChange={(e) => setEmbeddingBaseUrl(e.target.value)}
                    disabled={hasChunks}
                    className="font-mono text-[13px]"
                  />
                </Field>
                <Field label="API Key">
                  <SecretInput name="emb-key-field" value={embeddingApiKey} onChange={setEmbeddingApiKey} disabled={hasChunks} />
                </Field>
                <Field label="Dimensions">
                  <Input
                    name="emb-dims-field"
                    type="number"
                    autoComplete="off"
                    placeholder="e.g., 1536"
                    value={embeddingDimensions}
                    onChange={(e) => setEmbeddingDimensions(e.target.value)}
                    disabled={hasChunks}
                    className="font-mono text-[13px]"
                  />
                </Field>
              </SettingsSection>

              <SettingsSection
                index="03"
                title="Retrieval Configuration"
                description="Controls which chunks the search_documents tool returns. Higher thresholds return fewer, more relevant chunks."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Similarity Threshold (0–1)" hint="Minimum cosine similarity">
                    <Input
                      name="retrieval-threshold-field"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      autoComplete="off"
                      placeholder="e.g., 0.1"
                      value={similarityThreshold}
                      onChange={(e) => setSimilarityThreshold(e.target.value)}
                      className="font-mono text-[13px]"
                    />
                  </Field>
                  <Field label="Max Results (1–50)" hint="Passages sent to the model">
                    <Input
                      name="retrieval-topk-field"
                      type="number"
                      min={1}
                      max={50}
                      step={1}
                      autoComplete="off"
                      placeholder="e.g., 15"
                      value={topK}
                      onChange={(e) => setTopK(e.target.value)}
                      className="font-mono text-[13px]"
                    />
                  </Field>
                </div>
              </SettingsSection>

              {/* Sticky footer with status + actions */}
              <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-5 py-4 backdrop-blur md:-mx-8 md:px-8">
                <div className="mr-auto min-w-0 text-sm" aria-live="polite">
                  {success && (
                    <span className="flex items-center gap-1.5 text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      Settings saved successfully.
                    </span>
                  )}
                  {error && (
                    <span className="flex items-center gap-1.5 text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </span>
                  )}
                </div>
                <Button type="button" variant="ghost" onClick={() => navigate(-1)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving} className="min-w-24">
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  )
}

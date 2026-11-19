import { useAuth } from '@/hooks/useAuth'
import { useRealtimeDocuments } from '@/hooks/useRealtimeDocuments'
import { DocumentUpload } from '@/components/documents/DocumentUpload'
import { DocumentList } from '@/components/documents/DocumentList'
import { AppShell } from '@/components/AppShell'

export function DocumentsPage() {
  const { user } = useAuth()
  const { documents, loading, refetch } = useRealtimeDocuments(user?.id)

  // Summary figures for the header
  const ready = documents.filter(d => d.status === 'completed')
  const totalChunks = ready.reduce((sum, d) => sum + (d.chunk_count || 0), 0)

  return (
    <AppShell active="documents">
      <div className="scrollbar-quiet h-full overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-10 px-5 py-10 md:px-8">
          <header className="fade-up">
            <p className="eyebrow mb-3">Library</p>
            <h1 className="font-serif text-[40px] font-normal leading-none tracking-tight">Documents</h1>
            <p className="mt-3 max-w-lg text-[15px] text-muted-foreground">
              Everything here is split into passages and indexed, so Margin can quote it back to you in chat.
            </p>
            {!loading && documents.length > 0 && (
              <p className="mt-5 font-mono text-[12px] text-muted-foreground">
                {documents.length} {documents.length === 1 ? 'file' : 'files'} · {ready.length} ready · {totalChunks.toLocaleString()} passages
              </p>
            )}
          </header>

          <DocumentUpload onUploadComplete={refetch} />
          <DocumentList documents={documents} loading={loading} />
        </div>
      </div>
    </AppShell>
  )
}

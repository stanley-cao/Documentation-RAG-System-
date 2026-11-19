import { useState } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import { deleteDocument } from '@/lib/api'
import type { Document } from '@/types'
import { cn } from '@/lib/utils'

interface DocumentListProps {
  documents: Document[]
  loading: boolean
}

/** Status shown as a colored dot + the raw status word (the E2E suite reads the word) */
function StatusBadge({ status }: { status: Document['status'] }) {
  const dot: Record<Document['status'], string> = {
    pending: 'bg-warning',
    processing: 'bg-primary animate-pulse',
    completed: 'bg-primary',
    failed: 'bg-destructive',
  }
  const text: Record<Document['status'], string> = {
    pending: 'text-warning',
    processing: 'text-primary',
    completed: 'text-muted-foreground',
    failed: 'text-destructive',
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-[11px]', text[status])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot[status])} />
      {status}
    </span>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function DocumentList({ documents, loading }: DocumentListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return

    setDeletingId(doc.id)
    try {
      await deleteDocument(doc.id)
    } catch (error) {
      console.error('Failed to delete document:', error)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-accent/60" />)}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <p className="py-6 text-center font-serif text-[17px] italic text-muted-foreground">
        No documents uploaded yet. Upload a file to get started.
      </p>
    )
  }

  return (
    <section>
      <h2 className="eyebrow mb-3">Files</h2>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {documents.map(doc => (
          <li key={doc.id} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-background/60">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <p className="truncate text-sm font-medium">{doc.filename}</p>
                <StatusBadge status={doc.status} />
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {formatFileSize(doc.file_size)}
                {doc.status === 'completed' && <> · {doc.chunk_count} chunks</>}
                {' · '}{formatDate(doc.created_at)}
                {doc.status === 'failed' && doc.error_message && (
                  <span className="text-destructive"> · {doc.error_message}</span>
                )}
              </p>
            </div>
            <button
              onClick={() => handleDelete(doc)}
              disabled={deletingId === doc.id}
              title={`Delete ${doc.filename}`}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deletingId === doc.id ? 'Deleting…' : 'Delete'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

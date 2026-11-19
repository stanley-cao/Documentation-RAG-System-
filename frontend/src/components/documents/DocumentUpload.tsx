import { useCallback, useState } from 'react'
import { AlertCircle, Loader2, Upload } from 'lucide-react'
import { uploadDocument } from '@/lib/api'
import { cn } from '@/lib/utils'

const ALLOWED_EXTENSIONS = ['.txt', '.md']
const MAX_BYTES = 10 * 1024 * 1024

interface DocumentUploadProps {
  onUploadComplete: () => void
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mirror the backend's checks so users get instant feedback
  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
    }
    if (file.size > MAX_BYTES) {
      return 'File too large. Maximum size is 10 MB.'
    }
    return null
  }

  const handleUpload = async (files: FileList | File[]) => {
    setError(null)
    const fileArray = Array.from(files)

    for (const file of fileArray) {
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setUploading(true)
    try {
      for (const file of fileArray) {
        await uploadDocument(file)
      }
      onUploadComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files)
    }
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files)
      e.target.value = '' // allow re-selecting the same file
    }
  }

  const openPicker = () => document.getElementById('file-upload')?.click()

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openPicker}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() } }}
        className={cn(
          'group relative cursor-pointer overflow-hidden rounded-xl border border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDragging
            ? 'border-primary bg-highlight'
            : 'border-input bg-card/50 hover:border-primary/50 hover:bg-card'
        )}
      >
        {/* Ruled-paper lines behind the drop zone */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 27px, hsl(var(--border)) 27px 28px)' }}
        />
        <input
          id="file-upload"
          type="file"
          className="hidden"
          accept=".txt,.md"
          multiple
          onChange={handleFileInput}
        />
        <div className="relative flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border bg-background text-primary transition-transform group-hover:-translate-y-0.5">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          </div>
          <div>
            <p className="font-serif text-[19px]">
              {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Supported: .txt, .md (max 10 MB)
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

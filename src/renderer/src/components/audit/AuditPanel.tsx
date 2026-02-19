import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorInfo } from '../../utils/errorMessages'

type InputMode = 'url' | 'file'
type FileType = 'html' | 'json' | 'csv'

interface Props {
  projectId:  string
  onResult:   (result: any) => void
  onProgress: (step: string) => void
  onAuditedUrl: (url: string | null) => void
}

export function AuditPanel({ projectId, onResult, onProgress, onAuditedUrl }: Props) {
  const [mode, setMode]           = useState<InputMode>('url')
  const [url, setUrl]             = useState('')
  const [filePath, setFilePath]   = useState('')
  const [fileType, setFileType]   = useState<FileType>('json')
  const [running, setRunning]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const canRun = !running && (mode === 'url' ? url.trim().length > 0 : filePath.length > 0)

  async function handleAudit() {
    setRunning(true)
    setError(null)
    onProgress('Starting audit…')
    try {
      const req = mode === 'url'
        ? { type: 'url' as const, projectId, url: url.trim() }
        : { type: 'file' as const, projectId, filePath, fileType }

      const result = await window.api.audit.run(req)
      onResult(result)
      if (mode === 'url') onAuditedUrl(url.trim())
      onProgress('')
    } catch (e: any) {
      setError(e?.message ?? 'Audit failed. Check your API key and try again.')
      onProgress('')
    } finally {
      setRunning(false)
    }
  }

  function handleFileBrowse() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.html'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) {
        setFilePath((file as any).path ?? file.name)
        // Auto-detect file type from extension
        const ext = file.name.split('.').pop()?.toLowerCase()
        if (ext === 'json' || ext === 'csv' || ext === 'html') setFileType(ext)
      }
    }
    input.click()
  }

  const errorInfo = error ? getErrorInfo(error) : null

  return (
    <div className="p-4 space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1.5">
        {(['url', 'file'] as InputMode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null) }}
            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
              mode === m
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {m === 'url' ? 'Live URL' : 'File Upload'}
          </button>
        ))}
      </div>

      {/* Input area */}
      {mode === 'url' ? (
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && canRun && handleAudit()}
          placeholder="https://example.com/es/"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        />
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={filePath}
            readOnly
            placeholder="Select a translation file…"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-400"
          />
          <select
            value={fileType}
            onChange={e => setFileType(e.target.value as FileType)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-gray-100"
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="html">HTML</option>
          </select>
          <button
            onClick={handleFileBrowse}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-2 rounded text-sm"
          >
            Browse
          </button>
        </div>
      )}

      {/* Error */}
      {errorInfo && (
        <div className="bg-red-950 border border-red-800 rounded px-3 py-2 text-xs text-red-300 space-y-1">
          <p>{errorInfo.message}</p>
          {errorInfo.goToSettings && (
            <Link to="/settings" className="text-blue-400 hover:text-blue-300 underline">
              Go to Settings →
            </Link>
          )}
        </div>
      )}

      {/* Run button */}
      <button
        onClick={handleAudit}
        disabled={!canRun}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded text-sm font-medium transition-colors"
      >
        {running ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⟳</span> Auditing…
          </span>
        ) : (
          'Run Audit'
        )}
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'

interface AuditRecord {
  id:          string
  project_id:  string
  input_type:  'url' | 'file'
  input_ref:   string
  final_score: number
  created_at:  number  // Unix timestamp (seconds)
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function formatDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function HistoryPage() {
  const [audits, setAudits]   = useState<AuditRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    window.api.audit.history('default')
      .then((data: any[]) => {
        setAudits(data)
        setLoading(false)
      })
      .catch((e: any) => {
        setError(e?.message ?? 'Failed to load history')
        setLoading(false)
      })
  }, [])

  function handleDelete(auditId: string) {
    window.api.audit.delete(auditId).then(() => {
      setAudits(prev => prev.filter(a => a.id !== auditId))
    }).catch((e: any) => {
      alert(`Delete failed: ${e?.message ?? 'unknown error'}`)
    })
  }

  if (loading) {
    return <div className="p-8 text-gray-400 text-sm">Loading history…</div>
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Audit History</h1>

      {audits.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl opacity-20 mb-3">📋</div>
          <p className="text-gray-500 text-sm">No audits yet.</p>
          <p className="text-gray-600 text-xs mt-1">Run your first audit from the Audit tab.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {audits.map(audit => (
            <div
              key={audit.id}
              className="flex items-center gap-4 bg-gray-800 hover:bg-gray-750 rounded-lg p-4 group"
            >
              {/* Score */}
              <div className={`text-2xl font-bold tabular-nums w-12 text-right shrink-0 ${scoreColor(Math.round(audit.final_score ?? 0))}`}>
                {Math.round(audit.final_score ?? 0)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate" title={audit.input_ref}>
                  {audit.input_ref}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500 uppercase font-mono">
                    {audit.input_type}
                  </span>
                  <span className="text-gray-700">·</span>
                  <span className="text-xs text-gray-500">
                    {formatDate(audit.created_at)}
                  </span>
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(audit.id)}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete audit"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

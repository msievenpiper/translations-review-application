import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface AuditRecord {
  id:             string
  project_id:     string
  input_type:     'url' | 'file'
  input_ref:      string
  final_score:    number
  rubric_weights: string
  created_at:     number
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
  const navigate = useNavigate()
  const [audits, setAudits]   = useState<AuditRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Filter state
  const [search,   setSearch]   = useState('')
  const [minScore, setMinScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  useEffect(() => {
    window.api.audit.history('default')
      .then((data: any[]) => { setAudits(data); setLoading(false) })
      .catch((e: any)     => { setError(e?.message ?? 'Failed to load history'); setLoading(false) })
  }, [])

  function handleDelete(auditId: string) {
    window.api.audit.delete(auditId)
      .then(() => setAudits(prev => prev.filter(a => a.id !== auditId)))
      .catch((e: any) => alert(`Delete failed: ${e?.message ?? 'unknown error'}`))
  }

  const filtered = audits.filter(a => {
    if (search && !(a.input_ref ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (minScore !== '' && (a.final_score ?? 0) < Number(minScore)) return false
    if (maxScore !== '' && (a.final_score ?? 0) > Number(maxScore)) return false
    if (fromDate) {
      const from = new Date(fromDate + 'T00:00:00').getTime() / 1000
      if (a.created_at < from) return false
    }
    if (toDate) {
      const to = new Date(toDate + 'T00:00:00').getTime() / 1000 + 86399 // end of day
      if (a.created_at > to) return false
    }
    return true
  })

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading history…</div>
  if (error)   return <div className="p-8"><p className="text-red-400 text-sm">{error}</p></div>

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Audit History</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search URL or file…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="number"
          placeholder="Min score"
          min={0} max={100}
          value={minScore}
          onChange={e => setMinScore(e.target.value)}
          className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="number"
          placeholder="Max score"
          min={0} max={100}
          value={maxScore}
          onChange={e => setMaxScore(e.target.value)}
          className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        />
        <input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl opacity-20 mb-3">📋</div>
          <p className="text-gray-500 text-sm">{audits.length === 0 ? 'No audits yet.' : 'No audits match the filters.'}</p>
          {audits.length === 0 && (
            <p className="text-gray-600 text-xs mt-1">Run your first audit from the Audit tab.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(audit => (
            <div
              key={audit.id}
              className="flex items-center gap-4 bg-gray-800 hover:bg-gray-750 rounded-lg p-4 group"
            >
              <div className={`text-2xl font-bold tabular-nums w-12 text-right shrink-0 ${scoreColor(Math.round(audit.final_score ?? 0))}`}>
                {Math.round(audit.final_score ?? 0)}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate" title={audit.input_ref}>
                  {audit.input_ref}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500 uppercase font-mono">{audit.input_type}</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-xs text-gray-500">{formatDate(audit.created_at)}</span>
                </div>
              </div>

              <button
                onClick={() => navigate(`/history/${audit.id}`)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors opacity-0 group-hover:opacity-100"
              >
                View
              </button>
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

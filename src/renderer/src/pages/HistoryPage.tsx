import { type JSX, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts'

interface AuditRecord {
  id: string
  project_id: string
  input_type: 'url' | 'file'
  input_ref: string
  final_score: number
  rubric_weights: string
  schedule_run_id: string | null
  created_at: number
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function formatDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function formatShortDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

interface DeltaBadgeProps {
  delta: number | null
}

function DeltaBadge({ delta }: DeltaBadgeProps): JSX.Element {
  if (delta === null) {
    return <span className="text-xs text-gray-600 w-12 text-right tabular-nums">—</span>
  }
  const sign = delta >= 0 ? '+' : ''
  const color = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-500'
  return (
    <span className={`text-xs tabular-nums w-12 text-right shrink-0 ${color}`}>
      {sign}
      {delta.toFixed(1)}
    </span>
  )
}

/** Build a map from audit.id → delta vs the previous audit of the same input_ref */
function buildDeltaMap(audits: AuditRecord[]): Map<string, number | null> {
  // Group by input_ref, sorted ascending by created_at
  const byRef = new Map<string, AuditRecord[]>()
  for (const a of audits) {
    const list = byRef.get(a.input_ref) ?? []
    list.push(a)
    byRef.set(a.input_ref, list)
  }
  for (const list of byRef.values()) {
    list.sort((a, b) => a.created_at - b.created_at)
  }

  const map = new Map<string, number | null>()
  for (const list of byRef.values()) {
    for (let i = 0; i < list.length; i++) {
      if (i === 0) {
        map.set(list[i].id, null)
      } else {
        const prev = list[i - 1].final_score ?? 0
        const curr = list[i].final_score ?? 0
        map.set(list[i].id, Math.round((curr - prev) * 10) / 10)
      }
    }
  }
  return map
}

interface TrendPoint {
  label: string
  score: number
  runId: string
}

/** Compute average score per unique schedule_run_id, sorted ascending by earliest audit in run */
function buildTrendData(audits: AuditRecord[]): TrendPoint[] {
  const byRun = new Map<string, { scores: number[]; minCreatedAt: number }>()
  for (const a of audits) {
    if (!a.schedule_run_id) continue
    const entry = byRun.get(a.schedule_run_id) ?? { scores: [], minCreatedAt: Infinity }
    entry.scores.push(a.final_score ?? 0)
    entry.minCreatedAt = Math.min(entry.minCreatedAt, a.created_at)
    byRun.set(a.schedule_run_id, entry)
  }

  return Array.from(byRun.entries())
    .sort(([, a], [, b]) => a.minCreatedAt - b.minCreatedAt)
    .map(([runId, { scores, minCreatedAt }]) => ({
      runId,
      label: formatShortDate(minCreatedAt),
      score: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
    }))
}

export function HistoryPage(): JSX.Element {
  const navigate = useNavigate()
  const [audits, setAudits] = useState<AuditRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [minScore, setMinScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    window.api.audit
      .history('default')
      .then((data) => {
        setAudits(data as AuditRecord[])
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load history')
        setLoading(false)
      })
  }, [])

  function handleDelete(auditId: string): void {
    window.api.audit
      .delete(auditId)
      .then(() => setAudits((prev) => prev.filter((a) => a.id !== auditId)))
      .catch((e) => alert(`Delete failed: ${e instanceof Error ? e.message : 'unknown error'}`))
  }

  const filtered = audits.filter((a) => {
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

  const deltaMap = useMemo(() => buildDeltaMap(audits), [audits])
  const trendData = useMemo(() => buildTrendData(audits), [audits])

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading history…</div>
  if (error)
    return (
      <div className="p-8">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Audit History</h1>

      {/* Trend chart — only when ≥2 scheduled runs exist */}
      {trendData.length >= 2 && (
        <div className="mb-6 bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">
            Score trend (scheduled runs)
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#e5e7eb'
                }}
                formatter={(value: number | undefined) => [value ?? 0, 'Avg score']}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search URL or file…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="number"
          placeholder="Min score"
          min={0}
          max={100}
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="number"
          placeholder="Max score"
          min={0}
          max={100}
          value={maxScore}
          onChange={(e) => setMaxScore(e.target.value)}
          className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl opacity-20 mb-3">📋</div>
          <p className="text-gray-500 text-sm">
            {audits.length === 0 ? 'No audits yet.' : 'No audits match the filters.'}
          </p>
          {audits.length === 0 && (
            <p className="text-gray-600 text-xs mt-1">Run your first audit from the Audit tab.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((audit) => (
            <div
              key={audit.id}
              className="flex items-center gap-4 bg-gray-800 hover:bg-gray-750 rounded-lg p-4 group"
            >
              <div
                className={`text-2xl font-bold tabular-nums w-12 text-right shrink-0 ${scoreColor(Math.round(audit.final_score ?? 0))}`}
              >
                {Math.round(audit.final_score ?? 0)}
              </div>

              <DeltaBadge delta={deltaMap.get(audit.id) ?? null} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate" title={audit.input_ref}>
                  {audit.input_ref}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500 uppercase font-mono">
                    {audit.input_type}
                  </span>
                  <span className="text-gray-700">·</span>
                  <span className="text-xs text-gray-500">{formatDate(audit.created_at)}</span>
                  {audit.schedule_run_id && (
                    <>
                      <span className="text-gray-700">·</span>
                      <span
                        className="text-xs text-blue-500/70"
                        title={`Run: ${audit.schedule_run_id}`}
                      >
                        scheduled
                      </span>
                    </>
                  )}
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

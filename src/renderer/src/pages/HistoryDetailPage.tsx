import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnnotatedWebview } from '../components/audit/AnnotatedWebview'
import { CommentsPanel }    from '../components/audit/CommentsPanel'
import { ScorePanel }       from '../components/audit/ScorePanel'

interface AuditIssue {
  id:              number
  category:        string
  original_text:   string
  translated_text: string
  reason:          string
  suggestion:      string
  severity:        'low' | 'medium' | 'high'
  text:            string
}

function formatDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function HistoryDetailPage() {
  const { auditId }  = useParams<{ auditId: string }>()
  const navigate     = useNavigate()

  const [audit,       setAudit]       = useState<any>(null)
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [activeId,    setActiveId]    = useState<number | null>(null)

  useEffect(() => {
    if (!auditId) return
    Promise.all([
      window.api.audit.get(auditId),
      window.api.audit.snapshot(auditId),
    ])
      .then(([auditRow, snapUrl]) => {
        setAudit(auditRow)
        setSnapshotUrl(snapUrl)
        setLoading(false)
      })
      .catch((e: any) => {
        setError(e?.message ?? 'Failed to load audit')
        setLoading(false)
      })
  }, [auditId])

  const handleExport = useCallback(async () => {
    if (!auditId) return
    try {
      const filePath = await window.api.export.report(auditId)
      alert(`Report saved to:\n${filePath}`)
    } catch (e: any) {
      alert(`Export failed: ${e?.message ?? 'unknown error'}`)
    }
  }, [auditId])

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading audit…</div>
  if (error || !audit) return <div className="p-8"><p className="text-red-400 text-sm">{error ?? 'Audit not found'}</p></div>

  const categoryResults: any[] = (() => {
    try { return JSON.parse(audit.ai_results ?? '[]') } catch { return [] }
  })()

  const rubricWeights: Record<string, { weight: number }> = (() => {
    try { return JSON.parse(audit.rubric_weights ?? '{}') } catch { return {} }
  })()

  const weights = {
    accuracy:     rubricWeights.accuracy?.weight     ?? 40,
    fluency:      rubricWeights.fluency?.weight       ?? 20,
    completeness: rubricWeights.completeness?.weight  ?? 30,
    tone:         rubricWeights.tone?.weight          ?? 10,
  }

  const categoryScores: Record<string, number> = Object.fromEntries(
    categoryResults.map((r: any) => [r.category, r.score])
  )

  const issues: AuditIssue[] = categoryResults
    .flatMap((r: any) =>
      (r.issues ?? []).map((issue: any) => ({ ...issue, category: r.category }))
    )
    .map((issue: any, i: number) => ({
      ...issue,
      id:   i + 1,
      text: issue.original_text ?? issue.translated_text ?? '',
    }))

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0)
  const computedScore = totalWeight === 0 ? 0 : Math.round(
    Object.entries(categoryScores).reduce((sum, [cat, score]) => {
      return sum + score * (weights[cat as keyof typeof weights] ?? 0)
    }, 0) / totalWeight
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top strip */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 bg-gray-900">
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← History
        </button>
        <span className="text-gray-700">|</span>
        <p className="text-sm text-gray-200 font-medium truncate flex-1" title={audit.input_ref}>
          {audit.input_ref}
        </p>
        <span className="text-xs text-gray-500 shrink-0">{formatDate(audit.created_at)}</span>
      </div>

      {/* Score + rubric (read-only) */}
      <div className="shrink-0 border-b border-gray-800">
        <ScorePanel
          score={computedScore}
          weights={weights}
          categoryScores={categoryScores}
          onWeightChange={() => {}}
          customRules=""
          onCustomRules={() => {}}
          disabled={true}
        />
      </div>

      {/* Webview + comments */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          {snapshotUrl ? (
            <AnnotatedWebview
              url={snapshotUrl}
              issues={issues}
              onAnnotationClick={setActiveId}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-900 h-full">
              <div className="text-center">
                <div className="text-4xl mb-3 opacity-30">📄</div>
                <p className="text-gray-500 text-sm">No preview available for file audits</p>
              </div>
            </div>
          )}
        </div>
        <CommentsPanel
          issues={issues}
          activeId={activeId}
          onIssueClick={setActiveId}
          onExport={handleExport}
        />
      </div>
    </div>
  )
}

import { useState, useCallback } from 'react'
import { AuditPanel } from '../components/audit/AuditPanel'
import { ScorePanel } from '../components/audit/ScorePanel'
import { AnnotatedWebview } from '../components/audit/AnnotatedWebview'
import { CommentsPanel } from '../components/audit/CommentsPanel'
import { useScore, DEFAULT_WEIGHTS } from '../hooks/useScore'

const DEFAULT_PROJECT_ID = 'default'

interface AuditIssue {
  id:              number
  category:        string
  original_text:   string
  translated_text: string
  reason:          string
  suggestion:      string
  severity:        'low' | 'medium' | 'high'
  text:            string  // matches the original_text for annotation
}

export function AuditPage() {
  const { weights, updateWeight, categoryScores, setCategoryScores, computedScore } =
    useScore(DEFAULT_WEIGHTS)

  const [auditResult, setAuditResult] = useState<any>(null)
  const [auditedUrl, setAuditedUrl]   = useState<string | null>(null)
  const [activeIssueId, setActiveId]  = useState<number | null>(null)
  const [progress, setProgress]       = useState('')
  const [customRules, setCustomRules] = useState('')
  const [auditId, setAuditId]         = useState<string | null>(null)

  const handleResult = useCallback((result: any) => {
    setAuditResult(result)
    setAuditId(result.auditId ?? null)

    // Populate category scores for live re-scoring
    const scores: Record<string, number> = {}
    ;(result.categoryResults ?? []).forEach((r: any) => {
      scores[r.category] = r.score
    })
    setCategoryScores(scores)
  }, [setCategoryScores])

  // Build numbered issue list from AI result
  const issues: AuditIssue[] = (auditResult?.allIssues ?? []).map((issue: any, i: number) => ({
    ...issue,
    id:   i + 1,
    text: issue.original_text ?? issue.translated_text ?? '',
  }))

  async function handleExport() {
    if (!auditId) return
    try {
      const filePath = await window.api.export.report(auditId)
      alert(`Report saved to:\n${filePath}`)
    } catch (e: any) {
      alert(`Export failed: ${e?.message ?? 'unknown error'}`)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top section: audit input + score panel */}
      <div className="shrink-0 border-b border-gray-800">
        <AuditPanel
          projectId={DEFAULT_PROJECT_ID}
          onResult={handleResult}
          onProgress={setProgress}
          onAuditedUrl={setAuditedUrl}
        />
        {progress && (
          <p className="px-4 pb-2 text-xs text-blue-400 animate-pulse">{progress}</p>
        )}
        <ScorePanel
          score={computedScore}
          weights={weights}
          categoryScores={categoryScores}
          onWeightChange={updateWeight}
          customRules={customRules}
          onCustomRules={setCustomRules}
          disabled={!auditResult}
        />
      </div>

      {/* Bottom section: webview + comments */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          <AnnotatedWebview
            url={auditedUrl}
            issues={issues}
            onAnnotationClick={setActiveId}
          />
        </div>
        <CommentsPanel
          issues={issues}
          activeId={activeIssueId}
          onIssueClick={setActiveId}
          onExport={handleExport}
        />
      </div>
    </div>
  )
}

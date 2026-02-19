import { useEffect, useRef } from 'react'
import type { AnnotationIssue } from './AnnotatedWebview'

interface Issue extends AnnotationIssue {
  original_text:   string
  translated_text: string
  reason:          string
  suggestion:      string
}

interface Props {
  issues:            Issue[]
  activeId:          number | null
  onIssueClick:      (id: number) => void
  onExport:          () => void
}

const SEVERITY_STYLES: Record<string, string> = {
  low:    'bg-yellow-900 text-yellow-300 border-yellow-700',
  medium: 'bg-orange-900 text-orange-300 border-orange-700',
  high:   'bg-red-900 text-red-300 border-red-700',
}

export function CommentsPanel({ issues, activeId, onIssueClick, onExport }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs     = useRef<Record<number, HTMLDivElement | null>>({})

  useEffect(() => {
    if (activeId !== null && itemRefs.current[activeId]) {
      itemRefs.current[activeId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeId])

  return (
    <div className="w-64 shrink-0 flex flex-col border-l border-gray-800 bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800">
        <span className="text-xs font-medium text-gray-400">
          {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
        </span>
        <button
          onClick={onExport}
          disabled={issues.length === 0}
          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export Report
        </button>
      </div>

      {/* Issue list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto divide-y divide-gray-800">
        {issues.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-600 text-xs">No issues found.</p>
            <p className="text-gray-700 text-xs mt-1">Run an audit to see suggestions.</p>
          </div>
        ) : (
          issues.map(issue => (
            <div
              key={issue.id}
              ref={el => { itemRefs.current[issue.id] = el }}
              onClick={() => onIssueClick(issue.id)}
              className={`p-3 cursor-pointer text-xs transition-colors ${
                activeId === issue.id
                  ? 'bg-blue-950 border-l-2 border-l-blue-500'
                  : 'hover:bg-gray-900'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-gray-600 font-mono">#{issue.id}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.medium}`}>
                  {issue.severity}
                </span>
                <span className="text-gray-500 capitalize">{issue.category}</span>
              </div>

              {issue.translated_text && (
                <p className="text-gray-400 line-through mb-0.5 truncate" title={issue.translated_text}>
                  {issue.translated_text}
                </p>
              )}
              {issue.suggestion && (
                <p className="text-green-400 mb-1 truncate" title={issue.suggestion}>
                  → {issue.suggestion}
                </p>
              )}
              {issue.reason && (
                <p className="text-gray-600 leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
                  {issue.reason}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

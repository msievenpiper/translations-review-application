import { ipcMain, app } from 'electron'
import { getDb } from '../db/index'
import path from 'path'
import { writeFileSync } from 'fs'

interface AuditRow {
  project_id: string
  input_type: string
  input_ref: string
  ai_results: string
  final_score: number
  created_at: number
}

interface ProjectRow {
  name?: string
}

interface CategoryResult {
  category: string
  score: number
  issues: IssueRow[]
}

interface IssueRow {
  severity?: string
  translated_text?: string
  suggestion?: string
  reason?: string
}

export function registerExportHandlers(): void {
  ipcMain.handle('export:report', async (_event, auditId: string) => {
    const db = getDb()
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(auditId) as
      | AuditRow
      | undefined
    if (!audit) throw new Error(`Audit not found: ${auditId}`)

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(audit.project_id) as
      | ProjectRow
      | undefined
    const categories = JSON.parse(audit.ai_results ?? '[]') as CategoryResult[]

    const html = buildReportHtml(audit, project, categories)

    const downloadsDir = app.getPath('downloads')
    const filename = `translation-audit-${auditId.slice(0, 8)}-${Date.now()}.html`
    const outPath = path.join(downloadsDir, filename)
    writeFileSync(outPath, html, 'utf-8')

    return outPath
  })
}

function esc(s: string = ''): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#eab308'
  return '#ef4444'
}

function buildReportHtml(
  audit: AuditRow,
  project: ProjectRow | undefined,
  categories: CategoryResult[]
): string {
  const score = Math.round(audit.final_score ?? 0)
  const date = new Date(audit.created_at * 1000).toLocaleString()

  const categoryRows = categories
    .map((cat) => {
      const issueRows = (cat.issues ?? [])
        .map(
          (issue) => `
      <tr>
        <td class="issue-cat">${esc(cat.category)}</td>
        <td class="sev-${esc(issue.severity ?? 'medium')}">${esc(issue.severity ?? 'medium')}</td>
        <td><del>${esc(issue.translated_text)}</del></td>
        <td class="suggestion">${esc(issue.suggestion)}</td>
        <td class="reason">${esc(issue.reason)}</td>
      </tr>
    `
        )
        .join('')
      return `
      <tr class="cat-header">
        <td colspan="5">
          <strong>${esc(cat.category.toUpperCase())}</strong>
          — Score: <strong style="color:${scoreColor(cat.score)}">${cat.score}/100</strong>
        </td>
      </tr>
      ${issueRows || '<tr><td colspan="5" class="no-issues">No issues found for this category.</td></tr>'}
    `
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Translation Audit Report</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 960px; margin: 2rem auto; padding: 0 1rem;
    color: #1a1a1a; background: #fff;
  }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .meta { color: #666; font-size: 0.85rem; margin-bottom: 2rem; }
  .score-box {
    display: inline-flex; align-items: baseline; gap: 4px;
    margin-bottom: 2rem;
  }
  .score-num {
    font-size: 3.5rem; font-weight: 700; line-height: 1;
    color: ${scoreColor(score)};
  }
  .score-denom { font-size: 1.25rem; color: #999; }
  table { width: 100%; border-collapse: collapse; font-size: 0.83rem; margin-top: 1.5rem; }
  th { background: #f3f4f6; text-align: left; padding: 8px 12px; font-weight: 600; }
  td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .cat-header td { background: #f9fafb; font-size: 0.9rem; padding: 10px 12px; }
  .issue-cat { text-transform: capitalize; color: #4b5563; }
  .sev-high { color: #dc2626; font-weight: 600; }
  .sev-medium { color: #d97706; font-weight: 600; }
  .sev-low { color: #ca8a04; }
  del { color: #9ca3af; }
  .suggestion { color: #16a34a; }
  .reason { color: #6b7280; }
  .no-issues { color: #9ca3af; font-style: italic; }
  @media print { body { max-width: none; } }
</style>
</head>
<body>
  <h1>Translation Audit Report</h1>
  <p class="meta">
    <strong>${esc(project?.name ?? 'Unknown Project')}</strong>
    &nbsp;·&nbsp; ${esc(audit.input_type.toUpperCase())}
    &nbsp;·&nbsp; <a href="${esc(audit.input_ref)}">${esc(audit.input_ref)}</a>
    &nbsp;·&nbsp; ${esc(date)}
  </p>

  <div class="score-box">
    <span class="score-num">${score}</span>
    <span class="score-denom">/100</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Severity</th>
        <th>Found</th>
        <th>Suggestion</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>
      ${categoryRows || '<tr><td colspan="5" class="no-issues">No issues found. Great job!</td></tr>'}
    </tbody>
  </table>
</body>
</html>`
}

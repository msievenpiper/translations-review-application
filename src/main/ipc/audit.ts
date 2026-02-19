import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/index'
import { loadSettings } from '../settings'
import { runAudit } from '../scoring/engine'
import { fetchPageHtml } from '../extractor/url'
import { extractTextFromHtml } from '../extractor/html'
import { parseJsonTranslations } from '../extractor/json'
import { parseCsvTranslations } from '../extractor/csv'
import { readFileSync } from 'fs'
import type { AuditRequest } from './types'

export function registerAuditHandlers(): void {
  ipcMain.handle('audit:run', async (_event, req: AuditRequest) => {
    const db = getDb()
    const settings = loadSettings()

    // Use a default project if no projectId or project not found
    let project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.projectId) as any
    if (!project) {
      // Auto-create a default project
      const projectId = req.projectId || 'default'
      db.prepare(`
        INSERT OR IGNORE INTO projects (id, name, source_locale, target_locales, rubric_config, custom_rules)
        VALUES (?, 'Default Project', 'en', '["es"]', '{"accuracy":{"weight":40},"fluency":{"weight":20},"completeness":{"weight":30},"tone":{"weight":10}}', '')
      `).run(projectId)
      project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any
    }

    const rubric = JSON.parse(project.rubric_config)
    const targetLocales: string[] = JSON.parse(project.target_locales)
    const targetLocale = targetLocales[0] ?? 'unknown'

    let targetText = ''
    let sourceText = ''
    let inputRef = ''
    let htmlSnapshot = ''

    if (req.type === 'url') {
      const fetched = await fetchPageHtml(req.url)
      htmlSnapshot = fetched.html
      const extracted = extractTextFromHtml(fetched.html)
      targetText = extracted.allText
      sourceText = targetText
      inputRef = req.url
    } else {
      const raw = readFileSync(req.filePath, 'utf-8')
      if (req.fileType === 'json') {
        const pairs = parseJsonTranslations(raw)
        targetText = pairs.map(p => `${p.key}: ${p.value}`).join('\n')
        sourceText = targetText
      } else if (req.fileType === 'csv') {
        const pairs = parseCsvTranslations(raw)
        targetText = pairs.map(p => `${p.key}: ${p.value}`).join('\n')
        sourceText = targetText
      } else {
        htmlSnapshot = raw
        const extracted = extractTextFromHtml(raw)
        targetText = extracted.allText
        sourceText = targetText
      }
      inputRef = req.filePath
    }

    const result = await runAudit({
      sourceLocale: project.source_locale,
      targetLocale,
      sourceText,
      targetText,
      customRules: project.custom_rules,
      rubric,
      aiConfig: {
        provider: settings.provider,
        apiKey:   settings.apiKey,
        model:    settings.model,
      },
    })

    const auditId = randomUUID()
    db.prepare(`
      INSERT INTO audits (id, project_id, input_type, input_ref, ai_results, final_score, html_snapshot, rubric_weights)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      project.id,
      req.type,
      inputRef,
      JSON.stringify(result.categoryResults),
      result.finalScore,
      htmlSnapshot,
      project.rubric_config,
    )

    return { ...result, auditId }
  })

  ipcMain.handle('audit:history', (_event, projectId: string) => {
    return getDb()
      .prepare('SELECT * FROM audits WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId)
  })

  ipcMain.handle('audit:delete', (_event, auditId: string) => {
    getDb().prepare('DELETE FROM audits WHERE id = ?').run(auditId)
  })
}

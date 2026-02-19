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

interface ProjectRow {
  id: string
  source_locale: string
  target_locales: string
  rubric_config: string
  custom_rules: string
  rubric?: unknown
}

interface SnapshotRow {
  html_snapshot: string
}

export function registerAuditHandlers(): void {
  ipcMain.handle('audit:run', async (_event, req: AuditRequest) => {
    const db = getDb()
    const settings = loadSettings()

    // Use a default project if no projectId or project not found
    let project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.projectId) as
      | ProjectRow
      | undefined
    if (!project) {
      // Auto-create a default project
      const projectId = req.projectId || 'default'
      db.prepare(
        `
        INSERT OR IGNORE INTO projects (id, name, source_locale, target_locales, rubric_config, custom_rules)
        VALUES (?, 'Default Project', 'en', '["es"]', '{"accuracy":{"weight":40},"fluency":{"weight":20},"completeness":{"weight":30},"tone":{"weight":10}}', '')
      `
      ).run(projectId)
      project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRow
    }

    const rubric = JSON.parse(project.rubric_config)
    const targetLocales: string[] = JSON.parse(project.target_locales)
    const targetLocale = targetLocales[0] ?? 'unknown'

    let targetText = ''
    let sourceText = ''
    let inputRef = ''
    let htmlSnapshot = ''

    if (req.type === 'url') {
      const fetched = await fetchPageHtml(req.url, {
        userAgent: req.userAgent,
        acceptLanguage: req.acceptLanguage
      })
      if (!fetched.html?.trim()) {
        throw new Error(`Fetched page returned empty HTML for URL: ${req.url}`)
      }
      htmlSnapshot = fetched.mhtml
      const extracted = extractTextFromHtml(fetched.html)
      targetText = extracted.allText
      sourceText = targetText
      inputRef = req.url
    } else {
      const raw = readFileSync(req.filePath, 'utf-8')
      if (req.fileType === 'json') {
        const pairs = parseJsonTranslations(raw)
        targetText = pairs.map((p) => `${p.key}: ${p.value}`).join('\n')
        sourceText = targetText
      } else if (req.fileType === 'csv') {
        const pairs = parseCsvTranslations(raw)
        targetText = pairs.map((p) => `${p.key}: ${p.value}`).join('\n')
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
        apiKey: settings.apiKey,
        model: settings.model
      }
    })

    const auditId = randomUUID()
    db.prepare(
      `
      INSERT INTO audits (id, project_id, input_type, input_ref, ai_results, final_score, html_snapshot, rubric_weights)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      auditId,
      project.id,
      req.type,
      inputRef,
      JSON.stringify(result.categoryResults),
      result.finalScore,
      htmlSnapshot,
      project.rubric_config
    )

    return { ...result, auditId }
  })

  ipcMain.handle('audit:history', (_event, projectId: string) => {
    return getDb()
      .prepare(
        `
        SELECT id, project_id, input_type, input_ref, ai_results, final_score, rubric_weights, created_at
        FROM audits
        WHERE project_id = ?
        ORDER BY created_at DESC
      `
      )
      .all(projectId)
  })

  ipcMain.handle('audit:delete', (_event, auditId: string) => {
    getDb().prepare('DELETE FROM audits WHERE id = ?').run(auditId)
  })

  ipcMain.handle('audit:get', (_event, auditId: string) => {
    const row = getDb().prepare('SELECT * FROM audits WHERE id = ?').get(auditId)
    if (!row) throw new Error(`Audit not found: ${auditId}`)
    return row
  })

  ipcMain.handle('audit:snapshot', async (_event, auditId: string) => {
    const row = getDb().prepare('SELECT html_snapshot FROM audits WHERE id = ?').get(auditId) as
      | SnapshotRow
      | undefined
    if (!row) throw new Error(`Audit not found: ${auditId}`)
    if (!row.html_snapshot) return null

    const { app } = await import('electron')
    const { join } = await import('path')
    const { writeFileSync } = await import('fs')

    const isMhtml = row.html_snapshot.startsWith('MIME-Version:') ||
                    row.html_snapshot.startsWith('From -')
    const ext      = isMhtml ? 'mhtml' : 'html'
    const tempPath = join(app.getPath('temp'), `audit-preview.${ext}`)
    writeFileSync(tempPath, row.html_snapshot, 'utf-8')
    return `file://${tempPath}`
  })
}

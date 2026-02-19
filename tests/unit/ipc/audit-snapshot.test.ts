import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { applySchema } from '../../../src/main/db/schema'

describe('audits table snapshot columns', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    db.prepare(`
      INSERT INTO projects (id, name, source_locale, target_locales, rubric_config, custom_rules)
      VALUES ('p1', 'Test', 'en', '["es"]', '{"accuracy":{"weight":40},"fluency":{"weight":20},"completeness":{"weight":30},"tone":{"weight":10}}', '')
    `).run()
  })

  afterEach(() => db.close())

  it('stores html_snapshot and rubric_weights when inserted', () => {
    db.prepare(`
      INSERT INTO audits (id, project_id, input_type, input_ref, ai_results, final_score, html_snapshot, rubric_weights)
      VALUES ('a1', 'p1', 'url', 'https://example.com', '[]', 85, '<html>test</html>', '{"accuracy":{"weight":40}}')
    `).run()
    const row = db.prepare('SELECT html_snapshot, rubric_weights FROM audits WHERE id = ?').get('a1') as any
    expect(row.html_snapshot).toBe('<html>test</html>')
    expect(row.rubric_weights).toBe('{"accuracy":{"weight":40}}')
  })
})

describe('snapshot temp file', () => {
  it('can write and read HTML from a temp file', () => {
    const html = '<html><body>Hello world</body></html>'
    const tempPath = join(tmpdir(), 'test-audit-preview.html')
    writeFileSync(tempPath, html, 'utf-8')
    expect(existsSync(tempPath)).toBe(true)
    expect(readFileSync(tempPath, 'utf-8')).toBe(html)
  })
})

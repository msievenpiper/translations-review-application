import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../../../src/main/db/schema'

describe('database schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  afterEach(() => db.close())

  it('creates the projects table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('projects')
    expect(names).toContain('audits')
  })

  it('inserts and retrieves a project', () => {
    db.prepare(`
      INSERT INTO projects (id, name, source_locale, target_locales, rubric_config, custom_rules)
      VALUES ('p1', 'Test Site', 'en', '["es-MX"]', '{"accuracy":{"weight":40},"fluency":{"weight":20},"completeness":{"weight":30},"tone":{"weight":10}}', '')
    `).run()

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get('p1') as any
    expect(project.name).toBe('Test Site')
    expect(project.source_locale).toBe('en')
  })

  it('audits table has html_snapshot column', () => {
    const cols = db.prepare("PRAGMA table_info(audits)").all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('html_snapshot')
  })

  it('audits table has rubric_weights column', () => {
    const cols = db.prepare("PRAGMA table_info(audits)").all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('rubric_weights')
  })

  it('html_snapshot and rubric_weights default to empty values', () => {
    db.prepare(`
      INSERT INTO projects (id, name, source_locale, target_locales, rubric_config, custom_rules)
      VALUES ('p2', 'Snap Test', 'en', '["es"]', '{}', '')
    `).run()
    db.prepare(`
      INSERT INTO audits (id, project_id, input_type, input_ref)
      VALUES ('a1', 'p2', 'url', 'https://example.com')
    `).run()
    const row = db.prepare('SELECT html_snapshot, rubric_weights FROM audits WHERE id = ?').get('a1') as any
    expect(row.html_snapshot).toBe('')
    expect(row.rubric_weights).toBe('{}')
  })
})

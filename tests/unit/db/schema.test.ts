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
})

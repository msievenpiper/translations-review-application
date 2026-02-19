import Database from 'better-sqlite3'

export function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      base_url      TEXT,
      source_locale TEXT NOT NULL,
      target_locales TEXT NOT NULL DEFAULT '[]',
      rubric_config TEXT NOT NULL DEFAULT '{}',
      custom_rules  TEXT NOT NULL DEFAULT '',
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS audits (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      input_type    TEXT NOT NULL CHECK(input_type IN ('url','file')),
      input_ref     TEXT NOT NULL,
      extracted_text TEXT NOT NULL DEFAULT '{}',
      ai_results    TEXT NOT NULL DEFAULT '[]',
      final_score   REAL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
}

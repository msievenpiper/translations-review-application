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

    CREATE TABLE IF NOT EXISTS project_tracked_urls (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      url             TEXT NOT NULL,
      user_agent      TEXT,
      accept_language TEXT,
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      enabled         INTEGER NOT NULL DEFAULT 1,
      frequency       TEXT NOT NULL,
      day_of_week     INTEGER,
      day_of_month    INTEGER,
      time_of_day     TEXT NOT NULL,
      last_run_at     INTEGER,
      next_run_at     INTEGER NOT NULL,
      created_at      INTEGER NOT NULL
    );
  `)

  // Idempotent column migrations — safe to run on existing databases
  const auditCols = (db.prepare('PRAGMA table_info(audits)').all() as { name: string }[]).map(
    (c) => c.name
  )

  if (!auditCols.includes('html_snapshot')) {
    db.exec("ALTER TABLE audits ADD COLUMN html_snapshot TEXT NOT NULL DEFAULT ''")
  }
  if (!auditCols.includes('rubric_weights')) {
    db.exec("ALTER TABLE audits ADD COLUMN rubric_weights TEXT NOT NULL DEFAULT '{}'")
  }
  if (!auditCols.includes('schedule_run_id')) {
    db.exec('ALTER TABLE audits ADD COLUMN schedule_run_id TEXT')
  }
}

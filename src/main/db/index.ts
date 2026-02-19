import Database from 'better-sqlite3'
import { applySchema } from './schema'

let _db: Database.Database | null = null

export function initDb(dbPath: string): void {
  if (_db) return // already initialized
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  applySchema(_db)
}

export function getDb(): Database.Database {
  if (!_db) {
    // Fallback for tests: in-memory database
    _db = new Database(':memory:')
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    applySchema(_db)
  }
  return _db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}

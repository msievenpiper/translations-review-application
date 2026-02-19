import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/index'

interface ProjectData {
  name?: string
  base_url?: string
  source_locale?: string
  target_locales?: string[]
  rubric_config?: Record<string, { weight: number }>
  custom_rules?: string
  [key: string]: unknown
}

export function registerProjectHandlers(): void {
  ipcMain.handle('projects:list', () =>
    getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
  )

  ipcMain.handle('projects:create', (_event, data: ProjectData) => {
    const id = randomUUID()
    getDb()
      .prepare(
        `
      INSERT INTO projects (id, name, base_url, source_locale, target_locales, rubric_config, custom_rules)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        data.name,
        data.base_url ?? null,
        data.source_locale,
        JSON.stringify(data.target_locales ?? []),
        JSON.stringify(
          data.rubric_config ?? {
            accuracy: { weight: 40 },
            fluency: { weight: 20 },
            completeness: { weight: 30 },
            tone: { weight: 10 }
          }
        ),
        data.custom_rules ?? ''
      )
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  ipcMain.handle('projects:update', (_event, id: string, data: ProjectData) => {
    const allowed = [
      'name',
      'base_url',
      'source_locale',
      'target_locales',
      'rubric_config',
      'custom_rules'
    ]
    const keys = Object.keys(data).filter((k) => allowed.includes(k))
    if (keys.length === 0) return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)

    const fields = keys.map((k) => `${k} = ?`).join(', ')
    const values = keys.map((k) =>
      typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k]
    )
    getDb()
      .prepare(`UPDATE projects SET ${fields} WHERE id = ?`)
      .run(...values, id)
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  ipcMain.handle('projects:delete', (_event, id: string) => {
    getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  })
}

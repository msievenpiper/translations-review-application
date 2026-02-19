import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { Scheduler } from '../scheduler'

interface ScheduleConfig {
  enabled?: number
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week?: number | null
  day_of_month?: number | null
  time_of_day: string
}

interface TrackedUrlOpts {
  userAgent?: string
  acceptLanguage?: string
}

export function registerScheduleHandlers(db: Database.Database, scheduler: Scheduler): void {
  ipcMain.handle('schedule:get', (_event, projectId: string) => {
    return db.prepare('SELECT * FROM schedules WHERE project_id = ?').get(projectId) ?? null
  })

  ipcMain.handle('schedule:upsert', (_event, projectId: string, config: ScheduleConfig) => {
    const existing = db.prepare('SELECT id FROM schedules WHERE project_id = ?').get(projectId) as
      | { id: string }
      | undefined

    const nextRunAt = Scheduler.computeNextRun(
      config.frequency,
      config.day_of_week ?? null,
      config.day_of_month ?? null,
      config.time_of_day
    )
    const nowSecs = Math.floor(Date.now() / 1000)

    if (existing) {
      db.prepare(
        `UPDATE schedules
         SET enabled = ?, frequency = ?, day_of_week = ?, day_of_month = ?,
             time_of_day = ?, next_run_at = ?
         WHERE id = ?`
      ).run(
        config.enabled ?? 1,
        config.frequency,
        config.day_of_week ?? null,
        config.day_of_month ?? null,
        config.time_of_day,
        nextRunAt,
        existing.id
      )
      return db.prepare('SELECT * FROM schedules WHERE id = ?').get(existing.id)
    } else {
      const id = randomUUID()
      db.prepare(
        `INSERT INTO schedules
           (id, project_id, enabled, frequency, day_of_week, day_of_month,
            time_of_day, next_run_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        projectId,
        config.enabled ?? 1,
        config.frequency,
        config.day_of_week ?? null,
        config.day_of_month ?? null,
        config.time_of_day,
        nextRunAt,
        nowSecs
      )
      return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id)
    }
  })

  ipcMain.handle('schedule:delete', (_event, projectId: string) => {
    db.prepare('DELETE FROM schedules WHERE project_id = ?').run(projectId)
  })

  ipcMain.handle('schedule:trackedUrls:list', (_event, projectId: string) => {
    return db
      .prepare('SELECT * FROM project_tracked_urls WHERE project_id = ? ORDER BY created_at ASC')
      .all(projectId)
  })

  ipcMain.handle(
    'schedule:trackedUrls:add',
    (_event, projectId: string, url: string, opts: TrackedUrlOpts = {}) => {
      const id = randomUUID()
      const nowSecs = Math.floor(Date.now() / 1000)
      db.prepare(
        `INSERT INTO project_tracked_urls
           (id, project_id, url, user_agent, accept_language, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`
      ).run(id, projectId, url, opts.userAgent ?? null, opts.acceptLanguage ?? null, nowSecs)
      return db.prepare('SELECT * FROM project_tracked_urls WHERE id = ?').get(id)
    }
  )

  ipcMain.handle('schedule:trackedUrls:toggle', (_event, urlId: string, enabled: boolean) => {
    db.prepare('UPDATE project_tracked_urls SET enabled = ? WHERE id = ?').run(
      enabled ? 1 : 0,
      urlId
    )
  })

  ipcMain.handle('schedule:trackedUrls:delete', (_event, urlId: string) => {
    db.prepare('DELETE FROM project_tracked_urls WHERE id = ?').run(urlId)
  })

  ipcMain.handle('schedule:runNow', async (_event, projectId: string) => {
    await scheduler.runProjectNow(projectId)
  })
}

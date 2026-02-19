import { randomUUID } from 'crypto'
import { Notification } from 'electron'
import type Database from 'better-sqlite3'
import { loadSettings } from '../settings'
import { runAudit } from '../scoring/engine'
import { fetchPageHtml } from '../extractor/url'
import { extractTextFromHtml } from '../extractor/html'

interface ScheduleRow {
  id: string
  project_id: string
  enabled: number
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week: number | null
  day_of_month: number | null
  time_of_day: string
  last_run_at: number | null
  next_run_at: number
  created_at: number
}

interface TrackedUrlRow {
  id: string
  project_id: string
  url: string
  user_agent: string | null
  accept_language: string | null
  enabled: number
  created_at: number
}

interface ProjectRow {
  id: string
  source_locale: string
  target_locales: string
  rubric_config: string
  custom_rules: string
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  start(): void {
    this.timer = setInterval(this.tick.bind(this), 60_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async runProjectNow(projectId: string): Promise<void> {
    const schedule = this.db
      .prepare('SELECT * FROM schedules WHERE project_id = ? AND enabled = 1')
      .get(projectId) as ScheduleRow | undefined

    if (!schedule) return
    await this.runSchedule(schedule)
  }

  private async tick(): Promise<void> {
    const nowSecs = Math.floor(Date.now() / 1000)
    const dueSchedules = this.db
      .prepare('SELECT * FROM schedules WHERE enabled = 1 AND next_run_at <= ?')
      .all(nowSecs) as ScheduleRow[]

    for (const schedule of dueSchedules) {
      await this.runSchedule(schedule)
    }
  }

  private async runSchedule(schedule: ScheduleRow): Promise<void> {
    const trackedUrls = this.db
      .prepare('SELECT * FROM project_tracked_urls WHERE project_id = ? AND enabled = 1')
      .all(schedule.project_id) as TrackedUrlRow[]

    if (trackedUrls.length === 0) return

    const project = this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(schedule.project_id) as ProjectRow | undefined

    if (!project) return

    const settings = loadSettings()
    const rubric = JSON.parse(project.rubric_config)
    const targetLocales: string[] = JSON.parse(project.target_locales)
    const targetLocale = targetLocales[0] ?? 'unknown'
    const scheduleRunId = randomUUID()
    let completedCount = 0
    let failedCount = 0

    for (const trackedUrl of trackedUrls) {
      try {
        const fetched = await fetchPageHtml(trackedUrl.url, {
          userAgent: trackedUrl.user_agent ?? undefined,
          acceptLanguage: trackedUrl.accept_language ?? undefined
        })

        if (!fetched.html?.trim()) continue

        const extracted = extractTextFromHtml(fetched.html)
        const result = await runAudit({
          sourceLocale: project.source_locale,
          targetLocale,
          sourceText: extracted.allText,
          targetText: extracted.allText,
          customRules: project.custom_rules,
          rubric,
          aiConfig: {
            provider: settings.provider,
            apiKey: settings.apiKey,
            model: settings.model
          }
        })

        const auditId = randomUUID()
        this.db
          .prepare(
            `INSERT INTO audits
               (id, project_id, input_type, input_ref, ai_results, final_score,
                html_snapshot, rubric_weights, schedule_run_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            auditId,
            project.id,
            'url',
            trackedUrl.url,
            JSON.stringify(result.categoryResults),
            result.finalScore,
            fetched.mhtml,
            project.rubric_config,
            scheduleRunId
          )

        completedCount++
      } catch {
        failedCount++
      }
    }

    const nowSecs = Math.floor(Date.now() / 1000)
    const nextRunAt = Scheduler.computeNextRun(
      schedule.frequency,
      schedule.day_of_week,
      schedule.day_of_month,
      schedule.time_of_day
    )

    this.db
      .prepare('UPDATE schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?')
      .run(nowSecs, nextRunAt, schedule.id)

    const title =
      failedCount === 0 ? `Scheduled audit complete` : `Scheduled audit finished with errors`
    const body = `${completedCount} URL${completedCount !== 1 ? 's' : ''} audited${failedCount > 0 ? `, ${failedCount} failed` : ''}.`

    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  }

  static computeNextRun(
    frequency: 'daily' | 'weekly' | 'monthly',
    dayOfWeek: number | null,
    dayOfMonth: number | null,
    timeOfDay: string,
    fromMs?: number
  ): number {
    const from = new Date(fromMs ?? Date.now())
    const [hourStr, minuteStr] = timeOfDay.split(':')
    const hour = parseInt(hourStr, 10)
    const minute = parseInt(minuteStr, 10)

    const candidate = new Date(from)
    candidate.setSeconds(0)
    candidate.setMilliseconds(0)

    if (frequency === 'daily') {
      candidate.setHours(hour, minute, 0, 0)
      if (candidate <= from) {
        candidate.setDate(candidate.getDate() + 1)
      }
    } else if (frequency === 'weekly') {
      const targetDay = dayOfWeek ?? 1 // default Monday
      const currentDay = candidate.getDay()
      let daysUntil = (targetDay - currentDay + 7) % 7
      candidate.setHours(hour, minute, 0, 0)
      if (daysUntil === 0 && candidate <= from) {
        daysUntil = 7
      }
      candidate.setDate(candidate.getDate() + daysUntil)
    } else if (frequency === 'monthly') {
      const targetDate = dayOfMonth ?? 1
      candidate.setDate(targetDate)
      candidate.setHours(hour, minute, 0, 0)
      if (candidate <= from) {
        // Move to next month
        candidate.setMonth(candidate.getMonth() + 1)
        candidate.setDate(targetDate)
      }
    }

    return Math.floor(candidate.getTime() / 1000)
  }
}

import type { RubricConfig } from '../settings'

export interface Project {
  id:             string
  name:           string
  base_url:       string | null
  source_locale:  string
  target_locales: string[]
  rubric_config:  RubricConfig
  custom_rules:   string
  created_at:     number
}

export type AuditRequest =
  | {
      type:            'url'
      projectId:       string
      url:             string
      userAgent?:      string
      acceptLanguage?: string
    }
  | { type: 'file'; projectId: string; filePath: string; fileType: 'html' | 'json' | 'csv' }

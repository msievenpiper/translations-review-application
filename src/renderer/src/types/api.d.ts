declare global {
  interface AppSettings {
    provider: 'claude' | 'openai'
    model: string
    apiKey: string
    defaultRubric: {
      accuracy: { weight: number }
      fluency: { weight: number }
      completeness: { weight: number }
      tone: { weight: number }
    }
  }

  interface ProjectDbRow {
    id: string
    name: string
    base_url: string | null
    source_locale: string
    target_locales: string
    rubric_config: string
    custom_rules: string
    created_at: number
  }

  interface AuditDbRow {
    id: string
    project_id: string
    input_type: 'url' | 'file'
    input_ref: string
    ai_results: string
    final_score: number
    html_snapshot: string
    rubric_weights: string
    created_at: number
  }

  interface ApiAuditIssue {
    original_text: string
    translated_text: string
    reason: string
    suggestion: string
    severity: 'low' | 'medium' | 'high'
  }

  interface ApiCategoryResult {
    category: string
    score: number
    issues: ApiAuditIssue[]
  }

  interface AuditRunResult {
    finalScore: number
    categoryResults: ApiCategoryResult[]
    categoryScores: Record<string, number>
    allIssues: (ApiAuditIssue & { category: string })[]
    auditId: string
  }

  type AuditRequest =
    | { type: 'url'; projectId: string; url: string; userAgent?: string; acceptLanguage?: string; targetLocale?: string }
    | { type: 'file'; projectId: string; filePath: string; fileType: 'html' | 'json' | 'csv'; targetLocale?: string }

  interface Window {
    api: {
      projects: {
        list: () => Promise<ProjectDbRow[]>
        create: (data: Partial<ProjectDbRow>) => Promise<ProjectDbRow>
        update: (id: string, data: Partial<ProjectDbRow>) => Promise<ProjectDbRow>
        delete: (id: string) => Promise<void>
      }
      audit: {
        run: (req: AuditRequest) => Promise<AuditRunResult>
        get: (auditId: string) => Promise<AuditDbRow>
        history: (projectId: string) => Promise<AuditDbRow[]>
        delete: (auditId: string) => Promise<void>
        snapshot: (auditId: string) => Promise<string | null>
      }
      settings: {
        load: () => Promise<AppSettings>
        save: (data: Partial<AppSettings>) => Promise<void>
      }
      export: {
        report: (auditId: string) => Promise<string>
      }
    }
  }
}
export {}

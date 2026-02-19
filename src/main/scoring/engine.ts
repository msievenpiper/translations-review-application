import { RUBRIC_CATEGORIES, buildCategoryPrompt } from '../ai/prompts'
import { createAiClient } from '../ai/index'
import type { AiIssue, CategoryResult } from '../ai/index'
import type { RubricConfig } from '../settings'

export interface AuditInput {
  sourceLocale:  string
  targetLocale:  string
  sourceText:    string
  targetText:    string
  customRules:   string
  rubric:        RubricConfig
  aiConfig:      { provider: 'claude' | 'openai'; apiKey: string; model: string }
  onProgress?:   (category: string, done: number, total: number) => void
}

export interface AuditResult {
  categoryResults: CategoryResult[]
  categoryScores:  Record<string, number>
  finalScore:      number
  allIssues:       (AiIssue & { category: string })[]
}

export function computeFinalScore(
  categoryScores: Record<string, number>,
  rubric: RubricConfig
): number {
  const totalWeight = Object.values(rubric).reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) return 0

  const weighted = RUBRIC_CATEGORIES.reduce((sum, cat) => {
    return sum + (categoryScores[cat] ?? 0) * (rubric[cat]?.weight ?? 0)
  }, 0)

  return Math.round(weighted / totalWeight)
}

export async function runAudit(input: AuditInput): Promise<AuditResult> {
  const client = createAiClient(input.aiConfig)
  const categoryResults: CategoryResult[] = []
  const total = RUBRIC_CATEGORIES.length

  for (let i = 0; i < RUBRIC_CATEGORIES.length; i++) {
    const category = RUBRIC_CATEGORIES[i]
    input.onProgress?.(category, i, total)

    const prompt = buildCategoryPrompt({
      category,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText:   input.sourceText,
      targetText:   input.targetText,
      customRules:  input.customRules,
    })

    const result = await client.evaluate(prompt)
    categoryResults.push({ category, ...result })
  }

  input.onProgress?.('done', total, total)

  const categoryScores = Object.fromEntries(
    categoryResults.map(r => [r.category, r.score])
  )

  const finalScore = computeFinalScore(categoryScores, input.rubric)

  const allIssues = categoryResults.flatMap(r =>
    r.issues.map(issue => ({ ...issue, category: r.category }))
  )

  return { categoryResults, categoryScores, finalScore, allIssues }
}

export type RubricCategory = 'accuracy' | 'fluency' | 'completeness' | 'tone'

export const RUBRIC_CATEGORIES: RubricCategory[] = ['accuracy', 'fluency', 'completeness', 'tone']

const CATEGORY_DESCRIPTIONS: Record<RubricCategory, string> = {
  accuracy:
    'Does the target text convey exactly the same meaning as the source? Flag any mistranslations, omissions, or additions of meaning.',
  fluency:
    'Does the target text read naturally and grammatically in the target language? Flag unnatural phrasing, grammar errors, or awkward constructions.',
  completeness:
    'Are all source strings present in the target? Flag any untranslated strings, placeholder text left in the source language, or missing content.',
  tone: 'Does the target text match the tone and style of the source (formality, voice, brand language)? Flag mismatches in register or style.'
}

export interface PromptParams {
  category: RubricCategory
  sourceLocale: string
  targetLocale: string
  sourceText: string
  targetText: string
  customRules: string
}

export function buildCategoryPrompt(params: PromptParams): string {
  const { category, sourceLocale, targetLocale, sourceText, targetText, customRules } = params
  const description = CATEGORY_DESCRIPTIONS[category]

  const customRulesSection = customRules.trim()
    ? `Custom rules to enforce:\n${customRules.trim()}\n\n`
    : ''

  return `You are a professional translation quality evaluator.

Source language: ${sourceLocale}
Target language: ${targetLocale}

Evaluation focus — ${category.toUpperCase()}: ${description}

Source text:
${sourceText}

Target text:
${targetText}

${customRulesSection}Respond ONLY with a JSON object matching this exact schema:
{
  "score": <integer 0-100>,
  "issues": [
    {
      "original_text": "<exact source phrase>",
      "translated_text": "<exact target phrase as found>",
      "reason": "<why this is an issue>",
      "suggestion": "<improved translation>",
      "severity": "low" | "medium" | "high"
    }
  ]
}

Return an empty issues array if no problems found. Do not include any text outside the JSON.`
}

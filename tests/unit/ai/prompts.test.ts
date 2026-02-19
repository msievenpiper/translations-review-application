import { describe, it, expect } from 'vitest'
import { buildCategoryPrompt, RUBRIC_CATEGORIES } from '../../../src/main/ai/prompts'

describe('buildCategoryPrompt', () => {
  it('includes source and target locale', () => {
    const prompt = buildCategoryPrompt({
      category: 'accuracy',
      sourceLocale: 'en',
      targetLocale: 'es-MX',
      sourceText: 'Log in',
      targetText: 'Entrar',
      customRules: '',
    })
    expect(prompt).toContain('en')
    expect(prompt).toContain('es-MX')
  })

  it('includes custom rules when provided', () => {
    const prompt = buildCategoryPrompt({
      category: 'tone',
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceText: 'Hey there!',
      targetText: 'Hey!',
      customRules: 'Always use formal Sie pronoun in German.',
    })
    expect(prompt).toContain('formal Sie pronoun')
  })

  it('includes JSON schema instruction in every prompt', () => {
    const prompt = buildCategoryPrompt({
      category: 'fluency',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourceText: 'test',
      targetText: 'test',
      customRules: '',
    })
    expect(prompt).toContain('score')
    expect(prompt).toContain('issues')
  })

  it('covers all rubric categories', () => {
    expect(RUBRIC_CATEGORIES).toEqual(['accuracy', 'fluency', 'completeness', 'tone'])
  })

  it('does not include custom rules section when rules are empty', () => {
    const prompt = buildCategoryPrompt({
      category: 'accuracy',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourceText: 'test',
      targetText: 'test',
      customRules: '',
    })
    expect(prompt).not.toContain('Custom rules')
  })
})

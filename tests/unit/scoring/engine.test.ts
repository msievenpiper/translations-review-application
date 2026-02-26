import { describe, it, expect } from 'vitest'
import { computeFinalScore } from '../../../src/main/scoring/engine'
import type { RubricConfig } from '../../../src/main/settings'

describe('computeFinalScore', () => {
  it('computes weighted average correctly', () => {
    const categoryScores = { accuracy: 80, fluency: 60, completeness: 100, tone: 40 }
    const rubric: RubricConfig = {
      accuracy: { weight: 40 },
      fluency: { weight: 20 },
      completeness: { weight: 30 },
      tone: { weight: 10 }
    }
    // 80*40 + 60*20 + 100*30 + 40*10 = 3200+1200+3000+400 = 7800 / 100 = 78
    expect(computeFinalScore(categoryScores, rubric)).toBe(78)
  })

  it('handles a rubric with only one category at full weight', () => {
    const categoryScores = { accuracy: 72, fluency: 0, completeness: 0, tone: 0 }
    const rubric: RubricConfig = {
      accuracy: { weight: 100 },
      fluency: { weight: 0 },
      completeness: { weight: 0 },
      tone: { weight: 0 }
    }
    expect(computeFinalScore(categoryScores, rubric)).toBe(72)
  })

  it('returns 0 when all weights are zero', () => {
    const categoryScores = { accuracy: 80, fluency: 60, completeness: 100, tone: 40 }
    const rubric: RubricConfig = {
      accuracy: { weight: 0 },
      fluency: { weight: 0 },
      completeness: { weight: 0 },
      tone: { weight: 0 }
    }
    expect(computeFinalScore(categoryScores, rubric)).toBe(0)
  })

  it('returns 0 when all category scores are 0', () => {
    const categoryScores = { accuracy: 0, fluency: 0, completeness: 0, tone: 0 }
    const rubric: RubricConfig = {
      accuracy: { weight: 40 },
      fluency: { weight: 20 },
      completeness: { weight: 30 },
      tone: { weight: 10 }
    }
    expect(computeFinalScore(categoryScores, rubric)).toBe(0)
  })
})

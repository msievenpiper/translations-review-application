import { useState, useCallback } from 'react'

export type RubricCategory = 'accuracy' | 'fluency' | 'completeness' | 'tone'

export interface RubricWeights {
  accuracy:     number
  fluency:      number
  completeness: number
  tone:         number
}

export interface CategoryScores {
  accuracy?:     number
  fluency?:      number
  completeness?: number
  tone?:         number
}

export const DEFAULT_WEIGHTS: RubricWeights = {
  accuracy:     40,
  fluency:      20,
  completeness: 30,
  tone:         10,
}

const CATEGORIES: RubricCategory[] = ['accuracy', 'fluency', 'completeness', 'tone']

function calcScore(scores: CategoryScores, weights: RubricWeights): number {
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0)
  if (totalWeight === 0) return 0
  const weighted = CATEGORIES.reduce((sum, cat) => {
    return sum + (scores[cat] ?? 0) * weights[cat]
  }, 0)
  return Math.round(weighted / totalWeight)
}

export function useScore(initialWeights: RubricWeights = DEFAULT_WEIGHTS) {
  const [weights, setWeights]       = useState<RubricWeights>(initialWeights)
  const [categoryScores, setScores] = useState<CategoryScores>({})

  const computedScore = calcScore(categoryScores, weights)

  const updateWeight = useCallback((cat: RubricCategory, value: number) => {
    setWeights(prev => ({ ...prev, [cat]: value }))
  }, [])

  const setCategoryScores = useCallback((scores: CategoryScores) => {
    setScores(scores)
  }, [])

  return { weights, updateWeight, categoryScores, setCategoryScores, computedScore }
}

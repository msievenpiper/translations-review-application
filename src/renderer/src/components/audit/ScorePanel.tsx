import type { JSX } from 'react'
import type { RubricWeights, CategoryScores, RubricCategory } from '../../hooks/useScore'

interface Props {
  score: number
  weights: RubricWeights
  categoryScores: CategoryScores
  onWeightChange: (cat: RubricCategory, value: number) => void
  customRules: string
  onCustomRules: (v: string) => void
  disabled: boolean
}

const CATEGORIES: { key: RubricCategory; label: string }[] = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'completeness', label: 'Completeness' },
  { key: 'tone', label: 'Tone & Style' }
]

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBarColor(score: number): string {
  if (score >= 80) return 'from-green-500 to-green-400'
  if (score >= 60) return 'from-yellow-500 to-yellow-400'
  return 'from-red-500 to-red-400'
}

export function ScorePanel({
  score,
  weights,
  categoryScores,
  onWeightChange,
  customRules,
  onCustomRules,
  disabled
}: Props): JSX.Element {
  return (
    <div className="p-4 space-y-4 border-b border-gray-800">
      {/* Score display */}
      <div className="flex items-center gap-4">
        <div className={`text-4xl font-bold tabular-nums ${scoreColor(score)}`}>{score}</div>
        <div className="text-gray-500 text-lg">/100</div>
        <div className="flex-1 bg-gray-700 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${scoreBarColor(score)} transition-all duration-500`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Rubric sliders */}
      <div className="space-y-2.5">
        {CATEGORIES.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-28 text-xs text-gray-400 shrink-0">{label}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={weights[key]}
              onChange={(e) => onWeightChange(key, Number(e.target.value))}
              disabled={disabled}
              className="flex-1 h-1.5 accent-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span className="w-8 text-xs text-right text-gray-400 tabular-nums">
              {weights[key]}%
            </span>
            {categoryScores[key] !== undefined && (
              <span
                className={`w-8 text-xs text-right tabular-nums font-medium ${scoreColor(categoryScores[key]!)}`}
              >
                {categoryScores[key]}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Custom rules */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Custom Rules</label>
        <textarea
          value={customRules}
          onChange={(e) => onCustomRules(e.target.value)}
          placeholder="e.g. Never translate our brand name 'Acme'. Use formal pronouns."
          disabled={disabled}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 resize-none focus:outline-none focus:border-blue-500 disabled:opacity-40"
        />
      </div>
    </div>
  )
}

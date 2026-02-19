import type { RubricCategory } from './prompts'

export interface AiIssue {
  original_text: string
  translated_text: string
  reason: string
  suggestion: string
  severity: 'low' | 'medium' | 'high'
}

export interface CategoryResult {
  category: RubricCategory
  score: number
  issues: AiIssue[]
}

export interface AiClientConfig {
  provider: 'claude' | 'openai'
  apiKey: string
  model: string
}

export interface AiEvaluateResult {
  score: number
  issues: AiIssue[]
}

export interface AiClient {
  evaluate(prompt: string): Promise<AiEvaluateResult>
}

// Exported for unit testing only
export function parseAiResponseForTesting(raw: string): AiEvaluateResult {
  return parseAiResponse(raw)
}

function parseAiResponse(raw: string): AiEvaluateResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON')
  const parsed = JSON.parse(jsonMatch[0])
  return {
    score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
    issues: Array.isArray(parsed.issues) ? parsed.issues : []
  }
}

export function createAiClient(config: AiClientConfig): AiClient {
  switch (config.provider) {
    case 'claude':
      return createClaudeClient(config)
    case 'openai':
      return createOpenAiClient(config)
    default:
      throw new Error(`unknown provider: ${(config as { provider: string }).provider}`)
  }
}

function createClaudeClient(config: AiClientConfig): AiClient {
  return {
    async evaluate(prompt: string): Promise<AiEvaluateResult> {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Anthropic = require('@anthropic-ai/sdk')
      const client = new Anthropic.default({ apiKey: config.apiKey })
      const msg = await client.messages.create({
        model: config.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
      const text = (msg.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
      return parseAiResponse(text)
    }
  }
}

function createOpenAiClient(config: AiClientConfig): AiClient {
  return {
    async evaluate(prompt: string): Promise<AiEvaluateResult> {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const OpenAI = require('openai')
      const client = new OpenAI.default({ apiKey: config.apiKey })
      const completion = await client.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: prompt }]
      })
      const text = completion.choices[0]?.message?.content ?? ''
      return parseAiResponse(text)
    }
  }
}

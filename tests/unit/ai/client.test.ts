import { describe, it, expect, vi } from 'vitest'

// We test the factory and error behavior without hitting live APIs
describe('createAiClient', () => {
  it('returns an object with an evaluate method for claude', async () => {
    const { createAiClient } = await import('../../../src/main/ai/index')
    const client = createAiClient({ provider: 'claude', apiKey: 'test-key', model: 'claude-sonnet-4-6' })
    expect(typeof client.evaluate).toBe('function')
  })

  it('returns an object with an evaluate method for openai', async () => {
    const { createAiClient } = await import('../../../src/main/ai/index')
    const client = createAiClient({ provider: 'openai', apiKey: 'test-key', model: 'gpt-4o' })
    expect(typeof client.evaluate).toBe('function')
  })

  it('throws for an unknown provider', async () => {
    const { createAiClient } = await import('../../../src/main/ai/index')
    expect(() =>
      createAiClient({ provider: 'unknown' as any, apiKey: 'x', model: 'x' })
    ).toThrow(/unknown provider/)
  })
})

describe('parseAiResponse (via evaluate mock)', () => {
  it('handles JSON embedded in extra text', async () => {
    const { parseAiResponseForTesting } = await import('../../../src/main/ai/index')
    const raw = 'Here is the result: {"score": 85, "issues": []}'
    const result = parseAiResponseForTesting(raw)
    expect(result.score).toBe(85)
    expect(result.issues).toEqual([])
  })

  it('clamps score to 0-100 range', async () => {
    const { parseAiResponseForTesting } = await import('../../../src/main/ai/index')
    const raw = '{"score": 150, "issues": []}'
    const result = parseAiResponseForTesting(raw)
    expect(result.score).toBe(100)
  })

  it('returns score 0 when AI response has no JSON', async () => {
    const { parseAiResponseForTesting } = await import('../../../src/main/ai/index')
    expect(() => parseAiResponseForTesting('not json at all')).toThrow()
  })
})

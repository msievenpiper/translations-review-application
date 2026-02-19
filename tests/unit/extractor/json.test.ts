import { describe, it, expect } from 'vitest'
import { parseJsonTranslations } from '../../../src/main/extractor/json'

describe('parseJsonTranslations', () => {
  it('parses flat key-value translation object', () => {
    const json = JSON.stringify({ "login": "Log in", "signup": "Sign up" })
    const result = parseJsonTranslations(json)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ key: 'login', value: 'Log in' })
  })

  it('flattens nested translation objects', () => {
    const json = JSON.stringify({ auth: { login: "Log in", logout: "Log out" } })
    const result = parseJsonTranslations(json)
    expect(result).toHaveLength(2)
    expect(result[0].key).toBe('auth.login')
    expect(result[0].value).toBe('Log in')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseJsonTranslations('not json')).toThrow()
  })
})

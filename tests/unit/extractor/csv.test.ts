import { describe, it, expect } from 'vitest'
import { parseCsvTranslations } from '../../../src/main/extractor/csv'

describe('parseCsvTranslations', () => {
  it('parses key,value CSV', () => {
    const csv = 'key,value\nlogin,Log in\nsignup,Sign up'
    const result = parseCsvTranslations(csv)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ key: 'login', value: 'Log in' })
  })

  it('throws on missing value column', () => {
    expect(() => parseCsvTranslations('key\nlogin')).toThrow(/value column/)
  })
})

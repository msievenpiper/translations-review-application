import { describe, it, expect } from 'vitest'
import { buildAnnotationScript, type AnnotationIssue } from '../../../src/main/scoring/annotations'

describe('buildAnnotationScript', () => {
  it('returns a string (self-contained JS)', () => {
    const issues: AnnotationIssue[] = [
      { id: 1, text: 'Log in', category: 'accuracy', severity: 'medium' },
    ]
    const script = buildAnnotationScript(issues)
    expect(typeof script).toBe('string')
    expect(script.length).toBeGreaterThan(0)
  })

  it('embeds issue text in the script', () => {
    const issues: AnnotationIssue[] = [
      { id: 1, text: 'Log in', category: 'accuracy', severity: 'medium' },
    ]
    const script = buildAnnotationScript(issues)
    expect(script).toContain('Log in')
  })

  it('includes data-audit-id attribute in the script', () => {
    const issues: AnnotationIssue[] = [
      { id: 1, text: 'Log in', category: 'accuracy', severity: 'medium' },
    ]
    const script = buildAnnotationScript(issues)
    expect(script).toContain('data-audit-id')
  })

  it('escapes backslashes in text to avoid script injection', () => {
    const issues: AnnotationIssue[] = [
      { id: 1, text: 'path\\to\\file', category: 'accuracy', severity: 'low' },
    ]
    const script = buildAnnotationScript(issues)
    // The raw backslash should be escaped in the JS output
    expect(script).toContain('path\\\\to\\\\file')
  })

  it('returns empty IIFE for empty issues array', () => {
    const script = buildAnnotationScript([])
    expect(typeof script).toBe('string')
    // Should not crash when there are no issues
  })
})

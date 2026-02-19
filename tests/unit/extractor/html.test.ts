import { describe, it, expect } from 'vitest'
import { extractTextFromHtml } from '../../../src/main/extractor/html'

describe('extractTextFromHtml', () => {
  it('extracts text content by section', () => {
    const html = `
      <html><body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <h1>Welcome to our platform</h1>
        <p>Sign in to continue exploring our features.</p>
        <button>Sign In</button>
      </body></html>
    `
    const result = extractTextFromHtml(html)
    expect(result.headings).toContain('Welcome to our platform')
    expect(result.body).toContain('Sign in to continue exploring our features.')
    expect(result.navigation).toContain('Home')
    expect(result.ctaButtons).toContain('Sign In')
  })

  it('strips script and style tags', () => {
    const html = `<html><body><script>alert('x')</script><p>Real text</p></body></html>`
    const result = extractTextFromHtml(html)
    expect(result.body).toContain('Real text')
    expect(result.body).not.toContain('alert')
  })

  it('returns flat allText for AI consumption', () => {
    const html = `<html><body><h1>Title</h1><p>Body text</p></body></html>`
    const result = extractTextFromHtml(html)
    expect(result.allText).toContain('Title')
    expect(result.allText).toContain('Body text')
  })
})

// tests/unit/extractor/url.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so these variables are available inside the vi.mock factory
const {
  mockSetUserAgent,
  mockSetExtraHTTPHeaders,
  mockSetViewport,
  mockGoto,
  mockContent,
  mockUrl,
  mockTitle,
  mockClose,
  mockPage,
  mockBrowser,
} = vi.hoisted(() => {
  const mockSetUserAgent = vi.fn()
  const mockSetExtraHTTPHeaders = vi.fn()
  const mockSetViewport = vi.fn()
  const mockGoto = vi.fn()
  const mockContent = vi.fn()
  const mockUrl = vi.fn()
  const mockTitle = vi.fn()
  const mockClose = vi.fn()

  const mockPage = {
    setUserAgent: mockSetUserAgent,
    setExtraHTTPHeaders: mockSetExtraHTTPHeaders,
    setViewport: mockSetViewport,
    goto: mockGoto,
    content: mockContent,
    url: mockUrl,
    title: mockTitle,
  }

  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: mockClose,
  }

  return {
    mockSetUserAgent,
    mockSetExtraHTTPHeaders,
    mockSetViewport,
    mockGoto,
    mockContent,
    mockUrl,
    mockTitle,
    mockClose,
    mockPage,
    mockBrowser,
  }
})

vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}))

import { fetchPageHtml } from '../../../src/main/extractor/url'

describe('fetchPageHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBrowser.newPage.mockResolvedValue(mockPage)
    mockGoto.mockResolvedValue({ status: () => 200 })
    mockContent.mockResolvedValue('<html><body>Hello</body></html>')
    mockUrl.mockReturnValue('https://example.com/')
    mockTitle.mockResolvedValue('Example')
  })

  it('returns html, finalUrl and title', async () => {
    const result = await fetchPageHtml('https://example.com/')
    expect(result.html).toBe('<html><body>Hello</body></html>')
    expect(result.finalUrl).toBe('https://example.com/')
    expect(result.title).toBe('Example')
  })

  it('does not call setUserAgent when no userAgent option is provided', async () => {
    await fetchPageHtml('https://example.com/')
    expect(mockSetUserAgent).not.toHaveBeenCalled()
  })

  it('calls setUserAgent with the provided string', async () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    await fetchPageHtml('https://example.com/', { userAgent: ua })
    expect(mockSetUserAgent).toHaveBeenCalledWith(ua)
  })

  it('does not call setExtraHTTPHeaders when no acceptLanguage option is provided', async () => {
    await fetchPageHtml('https://example.com/')
    expect(mockSetExtraHTTPHeaders).not.toHaveBeenCalled()
  })

  it('calls setExtraHTTPHeaders with Accept-Language when acceptLanguage is provided', async () => {
    await fetchPageHtml('https://example.com/', { acceptLanguage: 'es-ES,es;q=0.9' })
    expect(mockSetExtraHTTPHeaders).toHaveBeenCalledWith({ 'Accept-Language': 'es-ES,es;q=0.9' })
  })

  it('sets viewport to 390x844 for iPhone UA', async () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    await fetchPageHtml('https://example.com/', { userAgent: ua })
    expect(mockSetViewport).toHaveBeenCalledWith({ width: 390, height: 844 })
  })

  it('sets viewport to 1024x1366 for iPad UA', async () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    await fetchPageHtml('https://example.com/', { userAgent: ua })
    expect(mockSetViewport).toHaveBeenCalledWith({ width: 1024, height: 1366 })
  })

  it('sets viewport to 412x915 for Android UA', async () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    await fetchPageHtml('https://example.com/', { userAgent: ua })
    expect(mockSetViewport).toHaveBeenCalledWith({ width: 412, height: 915 })
  })

  it('keeps default 1280x900 viewport for desktop or custom UA', async () => {
    await fetchPageHtml('https://example.com/', { userAgent: 'SomeCustomUA/1.0' })
    expect(mockSetViewport).toHaveBeenCalledWith({ width: 1280, height: 900 })
  })

  it('throws when the page returns a 404', async () => {
    mockGoto.mockResolvedValue({ status: () => 404 })
    await expect(fetchPageHtml('https://example.com/missing')).rejects.toThrow('HTTP 404')
  })

  it('always closes the browser', async () => {
    mockGoto.mockRejectedValue(new Error('network error'))
    await expect(fetchPageHtml('https://example.com/')).rejects.toThrow()
    expect(mockClose).toHaveBeenCalled()
  })
})

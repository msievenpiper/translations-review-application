import puppeteer from 'puppeteer'

export interface FetchResult {
  html:     string
  mhtml:    string
  finalUrl: string
  title:    string
}

export interface FetchOptions {
  userAgent?:      string
  acceptLanguage?: string
}

// Viewport dimensions keyed by a substring present in the UA string.
// Checked in order; first match wins. Falls back to desktop.
const UA_VIEWPORTS: Array<{ match: string; width: number; height: number }> = [
  { match: 'iPad',    width: 1024, height: 1366 },
  { match: 'iPhone',  width: 390,  height: 844  },
  { match: 'Android', width: 412,  height: 915  },
]

function viewportForUA(ua: string): { width: number; height: number } {
  for (const { match, width, height } of UA_VIEWPORTS) {
    if (ua.includes(match)) return { width, height }
  }
  return { width: 1280, height: 900 }
}

export async function fetchPageHtml(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()

    if (opts.userAgent) {
      await page.setUserAgent(opts.userAgent)
      await page.setViewport(viewportForUA(opts.userAgent))
    } else {
      await page.setViewport({ width: 1280, height: 900 })
    }

    if (opts.acceptLanguage) {
      await page.setExtraHTTPHeaders({ 'Accept-Language': opts.acceptLanguage })
    }

    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    })

    if (!response || response.status() >= 400) {
      throw new Error(`Failed to fetch page: HTTP ${response?.status() ?? 'unknown'}`)
    }

    const html     = await page.content()
    const client   = await page.createCDPSession()
    const { data: mhtml } = await client.send('Page.captureSnapshot', { format: 'mhtml' })
    await client.detach()
    const finalUrl = page.url()
    const title    = await page.title()

    return { html, mhtml, finalUrl, title }
  } finally {
    await browser.close()
  }
}

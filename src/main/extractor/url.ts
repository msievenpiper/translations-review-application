import puppeteer from 'puppeteer'

export interface FetchResult {
  html:     string
  finalUrl: string
  title:    string
}

export async function fetchPageHtml(url: string): Promise<FetchResult> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })

    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    })

    if (!response || response.status() >= 400) {
      throw new Error(`Failed to fetch page: HTTP ${response?.status() ?? 'unknown'}`)
    }

    const html = await page.content()
    const finalUrl = page.url()
    const title = await page.title()

    return { html, finalUrl, title }
  } finally {
    await browser.close()
  }
}

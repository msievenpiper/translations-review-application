import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

const APP_MAIN = path.join(__dirname, '../../out/main/index.js')

test.describe('Translation Auditor App', () => {
  test('loads and shows the audit page with score panel', async () => {
    const app = await electron.launch({ args: [APP_MAIN] })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Wait for the score panel to appear
    await page.waitForSelector('[class*="text-4xl"]', { timeout: 10_000 })
    const scoreText = await page.locator('[class*="text-4xl"]').first().textContent()
    // Score should be "0" (no audit run yet)
    expect(scoreText?.trim()).toBe('0')

    await app.close()
  })

  test('adjusting rubric slider does not trigger an API call', async () => {
    const app = await electron.launch({ args: [APP_MAIN] })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    let apiCallCount = 0
    // Monitor network requests from the renderer
    page.on('request', req => {
      const url = req.url()
      if (url.includes('anthropic.com') || url.includes('openai.com')) {
        apiCallCount++
      }
    })

    // Find a range slider and move it (sliders are disabled until an audit runs,
    // so we dispatch a change event via JS to simulate weight adjustment)
    await page.waitForSelector('input[type="range"]', { timeout: 10_000 })
    const sliderCount = await page.locator('input[type="range"]').count()
    if (sliderCount > 0) {
      await page.evaluate(() => {
        const slider = document.querySelector('input[type="range"]') as HTMLInputElement | null
        if (slider) {
          slider.value = '50'
          slider.dispatchEvent(new Event('change', { bubbles: true }))
          slider.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })
      await page.waitForTimeout(500)
    }

    expect(apiCallCount).toBe(0)

    await app.close()
  })

  test('navigates to settings page', async () => {
    const app = await electron.launch({ args: [APP_MAIN] })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Click Settings link in sidebar
    await page.waitForSelector('text=Settings', { timeout: 10_000 })
    await page.click('text=Settings')
    await page.waitForTimeout(300)

    // Settings page should show AI Provider config
    const hasProvider = await page.locator('text=AI Provider').isVisible().catch(() => false)
    expect(hasProvider).toBe(true)

    await app.close()
  })
})

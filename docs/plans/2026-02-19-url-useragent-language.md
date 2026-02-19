# URL User Agent & Browser Language Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-audit Device (user agent) and Browser Language selects to the URL input's collapsible "Advanced" section, passed through to puppeteer on each fetch.

**Architecture:** The new optional fields flow from the renderer select → `AuditRequest` IPC type → `audit:run` handler → `fetchPageHtml` options. No persistence. The renderer owns preset data as a static const array; the extractor owns viewport mapping.

**Tech Stack:** Puppeteer (main), React 19 (renderer), Vitest (unit tests), TypeScript throughout.

---

### Task 1: Update `fetchPageHtml` to accept UA and language options

**Files:**
- Modify: `src/main/extractor/url.ts`
- Create: `tests/unit/extractor/url.test.ts`

**Step 1: Create the test file**

```ts
// tests/unit/extractor/url.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock puppeteer before importing the module under test
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

vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}))

import { fetchPageHtml } from '../../../src/main/extractor/url'

describe('fetchPageHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
```

**Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/extractor/url.test.ts
```

Expected: several failures — `setUserAgent` / `setExtraHTTPHeaders` / viewport tests will fail because the current implementation doesn't call them.

**Step 3: Update `fetchPageHtml` in `src/main/extractor/url.ts`**

Replace the entire file with:

```ts
import puppeteer from 'puppeteer'

export interface FetchResult {
  html:     string
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
    const finalUrl = page.url()
    const title    = await page.title()

    return { html, finalUrl, title }
  } finally {
    await browser.close()
  }
}
```

**Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/unit/extractor/url.test.ts
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/main/extractor/url.ts tests/unit/extractor/url.test.ts
git commit -m "feat: add userAgent and acceptLanguage options to fetchPageHtml"
```

---

### Task 2: Thread the new fields through IPC types and the audit handler

**Files:**
- Modify: `src/main/ipc/types.ts`
- Modify: `src/main/ipc/audit.ts`

No new tests needed — this is pure plumbing; the extractor tests already cover the behaviour.

**Step 1: Update `src/main/ipc/types.ts`**

Change the `url` variant of `AuditRequest`:

```ts
export type AuditRequest =
  | {
      type:             'url'
      projectId:        string
      url:              string
      userAgent?:       string
      acceptLanguage?:  string
    }
  | { type: 'file'; projectId: string; filePath: string; fileType: 'html' | 'json' | 'csv' }
```

**Step 2: Update `src/main/ipc/audit.ts`**

Find the block that handles `req.type === 'url'` (lines 38–43) and pass the options through:

```ts
if (req.type === 'url') {
  const fetched = await fetchPageHtml(req.url, {
    userAgent:      req.userAgent,
    acceptLanguage: req.acceptLanguage,
  })
  const extracted = extractTextFromHtml(fetched.html)
  targetText = extracted.allText
  sourceText = targetText
  inputRef   = req.url
}
```

**Step 3: Run full test suite to confirm nothing broke**

```bash
npm test
```

Expected: all 33+ tests pass.

**Step 4: Commit**

```bash
git add src/main/ipc/types.ts src/main/ipc/audit.ts
git commit -m "feat: thread userAgent and acceptLanguage through AuditRequest IPC"
```

---

### Task 3: Add the Advanced section to `AuditPanel`

**Files:**
- Modify: `src/renderer/src/components/audit/AuditPanel.tsx`

This task is renderer-only — no unit tests apply (E2E covers it). Replace the full file content:

**Step 1: Replace `src/renderer/src/components/audit/AuditPanel.tsx`**

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorInfo } from '../../utils/errorMessages'

type InputMode = 'url' | 'file'
type FileType  = 'html' | 'json' | 'csv'

interface UaPreset {
  label:     string
  userAgent: string | undefined   // undefined = puppeteer default
  viewport?: { width: number; height: number }
}

interface LangPreset {
  label:          string
  acceptLanguage: string | undefined  // undefined = no header
}

const UA_PRESETS: UaPreset[] = [
  { label: 'Desktop (default)', userAgent: undefined },
  {
    label: 'iPhone 15',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    label: 'iPad Pro',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    label: 'Android (Chrome)',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  { label: 'Custom…', userAgent: 'custom' },
]

const LANG_PRESETS: LangPreset[] = [
  { label: 'Browser default',            acceptLanguage: undefined },
  { label: 'English (en-US)',            acceptLanguage: 'en-US,en;q=0.9' },
  { label: 'English (en-GB)',            acceptLanguage: 'en-GB,en;q=0.9' },
  { label: 'Chinese Simplified (zh-CN)', acceptLanguage: 'zh-CN,zh;q=0.9' },
  { label: 'Chinese Traditional (zh-TW)',acceptLanguage: 'zh-TW,zh;q=0.9' },
  { label: 'Spanish (es-ES)',            acceptLanguage: 'es-ES,es;q=0.9' },
  { label: 'Spanish (es-MX)',            acceptLanguage: 'es-MX,es;q=0.9' },
  { label: 'Arabic (ar-SA)',             acceptLanguage: 'ar-SA,ar;q=0.9' },
  { label: 'Hindi (hi-IN)',              acceptLanguage: 'hi-IN,hi;q=0.9' },
  { label: 'Bengali (bn-BD)',            acceptLanguage: 'bn-BD,bn;q=0.9' },
  { label: 'Portuguese (pt-BR)',         acceptLanguage: 'pt-BR,pt;q=0.9' },
  { label: 'Portuguese (pt-PT)',         acceptLanguage: 'pt-PT,pt;q=0.9' },
  { label: 'Russian (ru-RU)',            acceptLanguage: 'ru-RU,ru;q=0.9' },
  { label: 'Japanese (ja-JP)',           acceptLanguage: 'ja-JP,ja;q=0.9' },
  { label: 'German (de-DE)',             acceptLanguage: 'de-DE,de;q=0.9' },
  { label: 'Korean (ko-KR)',             acceptLanguage: 'ko-KR,ko;q=0.9' },
  { label: 'French (fr-FR)',             acceptLanguage: 'fr-FR,fr;q=0.9' },
  { label: 'Turkish (tr-TR)',            acceptLanguage: 'tr-TR,tr;q=0.9' },
  { label: 'Vietnamese (vi-VN)',         acceptLanguage: 'vi-VN,vi;q=0.9' },
  { label: 'Tamil (ta-IN)',              acceptLanguage: 'ta-IN,ta;q=0.9' },
  { label: 'Italian (it-IT)',            acceptLanguage: 'it-IT,it;q=0.9' },
  { label: 'Urdu (ur-PK)',               acceptLanguage: 'ur-PK,ur;q=0.9' },
  { label: 'Thai (th-TH)',               acceptLanguage: 'th-TH,th;q=0.9' },
  { label: 'Persian (fa-IR)',            acceptLanguage: 'fa-IR,fa;q=0.9' },
  { label: 'Polish (pl-PL)',             acceptLanguage: 'pl-PL,pl;q=0.9' },
  { label: 'Indonesian (id-ID)',         acceptLanguage: 'id-ID,id;q=0.9' },
  { label: 'Malay (ms-MY)',              acceptLanguage: 'ms-MY,ms;q=0.9' },
  { label: 'Punjabi (pa-IN)',            acceptLanguage: 'pa-IN,pa;q=0.9' },
  { label: 'Dutch (nl-NL)',              acceptLanguage: 'nl-NL,nl;q=0.9' },
  { label: 'Ukrainian (uk-UA)',          acceptLanguage: 'uk-UA,uk;q=0.9' },
  { label: 'Swedish (sv-SE)',            acceptLanguage: 'sv-SE,sv;q=0.9' },
  { label: 'Norwegian (nb-NO)',          acceptLanguage: 'nb-NO,nb;q=0.9' },
  { label: 'Danish (da-DK)',             acceptLanguage: 'da-DK,da;q=0.9' },
  { label: 'Finnish (fi-FI)',            acceptLanguage: 'fi-FI,fi;q=0.9' },
  { label: 'Czech (cs-CZ)',              acceptLanguage: 'cs-CZ,cs;q=0.9' },
  { label: 'Hungarian (hu-HU)',          acceptLanguage: 'hu-HU,hu;q=0.9' },
  { label: 'Romanian (ro-RO)',           acceptLanguage: 'ro-RO,ro;q=0.9' },
  { label: 'Greek (el-GR)',              acceptLanguage: 'el-GR,el;q=0.9' },
  { label: 'Hebrew (he-IL)',             acceptLanguage: 'he-IL,he;q=0.9' },
  { label: 'Bulgarian (bg-BG)',          acceptLanguage: 'bg-BG,bg;q=0.9' },
  { label: 'Croatian (hr-HR)',           acceptLanguage: 'hr-HR,hr;q=0.9' },
  { label: 'Slovak (sk-SK)',             acceptLanguage: 'sk-SK,sk;q=0.9' },
  { label: 'Catalan (ca-ES)',            acceptLanguage: 'ca-ES,ca;q=0.9' },
  { label: 'Filipino (fil-PH)',          acceptLanguage: 'fil-PH,fil;q=0.9' },
  { label: 'Swahili (sw-KE)',            acceptLanguage: 'sw-KE,sw;q=0.9' },
  { label: 'Serbian (sr-RS)',            acceptLanguage: 'sr-RS,sr;q=0.9' },
  { label: 'Lithuanian (lt-LT)',         acceptLanguage: 'lt-LT,lt;q=0.9' },
  { label: 'Latvian (lv-LV)',            acceptLanguage: 'lv-LV,lv;q=0.9' },
  { label: 'Slovenian (sl-SI)',          acceptLanguage: 'sl-SI,sl;q=0.9' },
  { label: 'Estonian (et-EE)',           acceptLanguage: 'et-EE,et;q=0.9' },
  { label: 'Afrikaans (af-ZA)',          acceptLanguage: 'af-ZA,af;q=0.9' },
  { label: 'Custom…',                    acceptLanguage: 'custom' },
]

interface Props {
  projectId:    string
  onResult:     (result: any) => void
  onProgress:   (step: string) => void
  onAuditedUrl: (url: string | null) => void
}

export function AuditPanel({ projectId, onResult, onProgress, onAuditedUrl }: Props) {
  const [mode, setMode]                   = useState<InputMode>('url')
  const [url, setUrl]                     = useState('')
  const [filePath, setFilePath]           = useState('')
  const [fileType, setFileType]           = useState<FileType>('json')
  const [running, setRunning]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  // Advanced section state
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [uaPresetIndex, setUaPresetIndex]   = useState(0)               // index into UA_PRESETS
  const [customUa, setCustomUa]             = useState('')
  const [langPresetIndex, setLangPresetIndex] = useState(0)             // index into LANG_PRESETS
  const [customLang, setCustomLang]         = useState('')

  const selectedUa   = UA_PRESETS[uaPresetIndex]
  const selectedLang = LANG_PRESETS[langPresetIndex]
  const isCustomUa   = selectedUa.userAgent === 'custom'
  const isCustomLang = selectedLang.acceptLanguage === 'custom'

  const canRun = !running && (mode === 'url' ? url.trim().length > 0 : filePath.length > 0)

  async function handleAudit() {
    setRunning(true)
    setError(null)
    onProgress('Starting audit…')
    try {
      let req: any
      if (mode === 'url') {
        const userAgent      = isCustomUa   ? customUa.trim() || undefined   : selectedUa.userAgent
        const acceptLanguage = isCustomLang ? customLang.trim() || undefined : selectedLang.acceptLanguage
        req = { type: 'url' as const, projectId, url: url.trim(), userAgent, acceptLanguage }
      } else {
        req = { type: 'file' as const, projectId, filePath, fileType }
      }

      const result = await window.api.audit.run(req)
      onResult(result)
      if (mode === 'url') onAuditedUrl(url.trim())
      onProgress('')
    } catch (e: any) {
      setError(e?.message ?? 'Audit failed. Check your API key and try again.')
      onProgress('')
    } finally {
      setRunning(false)
    }
  }

  function handleFileBrowse() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.html'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) {
        setFilePath((file as any).path ?? file.name)
        const ext = file.name.split('.').pop()?.toLowerCase()
        if (ext === 'json' || ext === 'csv' || ext === 'html') setFileType(ext)
      }
    }
    input.click()
  }

  const errorInfo = error ? getErrorInfo(error) : null

  return (
    <div className="p-4 space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1.5">
        {(['url', 'file'] as InputMode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null) }}
            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
              mode === m
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {m === 'url' ? 'Live URL' : 'File Upload'}
          </button>
        ))}
      </div>

      {/* Input area */}
      {mode === 'url' ? (
        <>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canRun && handleAudit()}
            placeholder="https://example.com/es/"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          />

          {/* Advanced toggle */}
          <button
            onClick={() => setIsAdvancedOpen(o => !o)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            <span>{isAdvancedOpen ? '▾' : '▸'}</span>
            <span>Advanced</span>
          </button>

          {isAdvancedOpen && (
            <div className="space-y-2">
              {/* Device + Language selects */}
              <div className="flex gap-2">
                <select
                  value={uaPresetIndex}
                  onChange={e => setUaPresetIndex(Number(e.target.value))}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100"
                >
                  {UA_PRESETS.map((p, i) => (
                    <option key={i} value={i}>{p.label}</option>
                  ))}
                </select>
                <select
                  value={langPresetIndex}
                  onChange={e => setLangPresetIndex(Number(e.target.value))}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100"
                >
                  {LANG_PRESETS.map((p, i) => (
                    <option key={i} value={i}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Custom UA input */}
              {isCustomUa && (
                <input
                  type="text"
                  value={customUa}
                  onChange={e => setCustomUa(e.target.value)}
                  placeholder="Mozilla/5.0 (custom user agent…)"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                />
              )}

              {/* Custom language input */}
              {isCustomLang && (
                <input
                  type="text"
                  value={customLang}
                  onChange={e => setCustomLang(e.target.value)}
                  placeholder="fr-CH,fr;q=0.9"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                />
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={filePath}
            readOnly
            placeholder="Select a translation file…"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-400"
          />
          <select
            value={fileType}
            onChange={e => setFileType(e.target.value as FileType)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-gray-100"
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="html">HTML</option>
          </select>
          <button
            onClick={handleFileBrowse}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-2 rounded text-sm"
          >
            Browse
          </button>
        </div>
      )}

      {/* Error */}
      {errorInfo && (
        <div className="bg-red-950 border border-red-800 rounded px-3 py-2 text-xs text-red-300 space-y-1">
          <p>{errorInfo.message}</p>
          {errorInfo.goToSettings && (
            <Link to="/settings" className="text-blue-400 hover:text-blue-300 underline">
              Go to Settings →
            </Link>
          )}
        </div>
      )}

      {/* Run button */}
      <button
        onClick={handleAudit}
        disabled={!canRun}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded text-sm font-medium transition-colors"
      >
        {running ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⟳</span> Auditing…
          </span>
        ) : (
          'Run Audit'
        )}
      </button>
    </div>
  )
}
```

**Step 2: Run typechecks**

```bash
npm run typecheck
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/renderer/src/components/audit/AuditPanel.tsx
git commit -m "feat: add Advanced section with device and language selects to URL input"
```

---

### Task 4: Run full test suite and verify

**Step 1: Run all unit tests**

```bash
npm test
```

Expected: all tests pass (the new url.test.ts tests are included).

**Step 2: Run typechecks**

```bash
npm run typecheck
```

Expected: no errors.

**Step 3: Commit if anything was adjusted**

Only commit if you had to make additional fixes. Otherwise no commit needed.

---

### Task 5: Final verification

**Step 1: Run linter**

```bash
npm run lint
```

Expected: no errors.

**Step 2: Confirm worktree is clean**

```bash
git status
```

Expected: working tree clean.

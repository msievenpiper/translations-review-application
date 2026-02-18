# Translation Auditor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Electron desktop app that audits website translations, scores them via AI using a configurable weighted rubric, and annotates the rendered page with improvement suggestions.

**Architecture:** Electron main process owns all sensitive operations (AI calls, URL fetching, file I/O, SQLite). React renderer handles UI state including live rubric re-scoring from cached AI results. IPC channels provide a typed bridge between processes.

**Tech Stack:** electron-vite · React 18 · TypeScript · Tailwind CSS · better-sqlite3 · electron-store · Puppeteer · Vitest · Playwright

---

## Phase 1: Project Scaffold & Tooling

### Task 1: Scaffold the electron-vite project

**Files:**
- Create: all scaffold output files in `translation-review-application/`

**Step 1: Scaffold into the existing directory**

```bash
cd /Users/michael.sievenpiper/code/projects/translation-review-application
npm create @quick-start/electron@latest . -- --template react-ts
```

> If the tool refuses to scaffold into a non-empty directory, scaffold to a temp name then move:
> ```bash
> cd /Users/michael.sievenpiper/code/projects
> npm create @quick-start/electron@latest _tmp_audit -- --template react-ts
> cp -r _tmp_audit/. translation-review-application/
> rm -rf _tmp_audit
> ```

**Step 2: Verify the scaffold ran correctly**

```bash
ls translation-review-application/
# Expected: src/ electron.vite.config.ts package.json tsconfig.json
```

**Step 3: Install dependencies**

```bash
cd /Users/michael.sievenpiper/code/projects/translation-review-application
npm install
```

**Step 4: Smoke test the scaffold**

```bash
npm run dev
# Expected: Electron window opens with default vite template. Close it.
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite react-ts project"
```

---

### Task 2: Install all production and dev dependencies

**Step 1: Install production dependencies**

```bash
npm install better-sqlite3 electron-store puppeteer papaparse @anthropic-ai/sdk openai
```

**Step 2: Install Tailwind CSS**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Step 3: Configure Tailwind to scan renderer sources**

Edit `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
}
```

**Step 4: Add Tailwind directives to renderer CSS**

In `src/renderer/src/assets/main.css` (or create `src/renderer/src/index.css`):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Import it in `src/renderer/src/main.tsx`:
```ts
import './index.css'
```

**Step 5: Install dev dependencies for testing**

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event
npm install -D playwright @playwright/test playwright-electron
```

**Step 6: Install type definitions**

```bash
npm install -D @types/better-sqlite3 @types/papaparse
```

**Step 7: Configure Vitest**

Add to `electron.vite.config.ts` under the `main` vite config, or create a separate `vitest.config.ts`:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
```

**Step 8: Add test scripts to package.json**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

**Step 9: Commit**

```bash
git add -A
git commit -m "chore: install dependencies and configure tailwind + vitest"
```

---

## Phase 2: Database Layer

### Task 3: Database schema and migrations

**Files:**
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/index.ts`
- Create: `tests/unit/db/schema.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/db/schema.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../../../src/main/db/schema'

describe('database schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  afterEach(() => db.close())

  it('creates the projects table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('projects')
    expect(names).toContain('audits')
  })

  it('inserts and retrieves a project', () => {
    db.prepare(`
      INSERT INTO projects (id, name, source_locale, target_locales, rubric_config, custom_rules)
      VALUES ('p1', 'Test Site', 'en', '["es-MX"]', '{"accuracy":{"weight":40},"fluency":{"weight":20},"completeness":{"weight":30},"tone":{"weight":10}}', '')
    `).run()

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get('p1') as any
    expect(project.name).toBe('Test Site')
    expect(project.source_locale).toBe('en')
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/db/schema.test.ts
# Expected: FAIL — cannot find module '../../../src/main/db/schema'
```

**Step 3: Implement the schema**

Create `src/main/db/schema.ts`:
```ts
import Database from 'better-sqlite3'

export function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      base_url      TEXT,
      source_locale TEXT NOT NULL,
      target_locales TEXT NOT NULL DEFAULT '[]',
      rubric_config TEXT NOT NULL DEFAULT '{}',
      custom_rules  TEXT NOT NULL DEFAULT '',
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS audits (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      input_type    TEXT NOT NULL CHECK(input_type IN ('url','file')),
      input_ref     TEXT NOT NULL,
      extracted_text TEXT NOT NULL DEFAULT '{}',
      ai_results    TEXT NOT NULL DEFAULT '[]',
      final_score   REAL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
}
```

**Step 4: Create database connection module**

Create `src/main/db/index.ts`:
```ts
import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { applySchema } from './schema'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = app
      ? path.join(app.getPath('userData'), 'auditor.db')
      : ':memory:'
    _db = new Database(dbPath)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    applySchema(_db)
  }
  return _db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}
```

**Step 5: Run test to verify it passes**

```bash
npx vitest run tests/unit/db/schema.test.ts
# Expected: PASS
```

**Step 6: Commit**

```bash
git add src/main/db/ tests/unit/db/
git commit -m "feat: add database schema with projects and audits tables"
```

---

## Phase 3: Settings & AI Provider Configuration

### Task 4: Settings module with encrypted API key storage

**Files:**
- Create: `src/main/settings.ts`
- Create: `tests/unit/settings.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/settings.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

// Mock electron before importing settings
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-app' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

vi.mock('electron-store', () => {
  const store = new Map<string, unknown>()
  return {
    default: class {
      get(key: string, def?: unknown) { return store.get(key) ?? def }
      set(key: string, val: unknown) { store.set(key, val) }
    },
  }
})

import { saveSettings, loadSettings, DEFAULT_RUBRIC } from '../../src/main/settings'

describe('settings', () => {
  it('round-trips provider and model', () => {
    saveSettings({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' })
    const loaded = loadSettings()
    expect(loaded.provider).toBe('openai')
    expect(loaded.model).toBe('gpt-4o')
  })

  it('returns default rubric when none saved', () => {
    const loaded = loadSettings()
    expect(loaded.defaultRubric.accuracy.weight).toBe(40)
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/settings.test.ts
# Expected: FAIL — cannot find module
```

**Step 3: Implement settings module**

Create `src/main/settings.ts`:
```ts
import Store from 'electron-store'
import { safeStorage } from 'electron'

export interface RubricConfig {
  accuracy:     { weight: number }
  fluency:      { weight: number }
  completeness: { weight: number }
  tone:         { weight: number }
}

export interface AppSettings {
  provider:     'claude' | 'openai'
  model:        string
  apiKey:       string
  defaultRubric: RubricConfig
}

export const DEFAULT_RUBRIC: RubricConfig = {
  accuracy:     { weight: 40 },
  fluency:      { weight: 20 },
  completeness: { weight: 30 },
  tone:         { weight: 10 },
}

const store = new Store<Record<string, unknown>>()

export function saveSettings(settings: Partial<AppSettings>): void {
  if (settings.apiKey !== undefined) {
    const encrypted = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(settings.apiKey).toString('base64')
      : settings.apiKey
    store.set('apiKeyEncrypted', encrypted)
    store.set('apiKeyIsEncrypted', safeStorage.isEncryptionAvailable())
  }
  if (settings.provider) store.set('provider', settings.provider)
  if (settings.model)    store.set('model', settings.model)
  if (settings.defaultRubric) store.set('defaultRubric', settings.defaultRubric)
}

export function loadSettings(): AppSettings {
  const raw = store.get('apiKeyEncrypted', '') as string
  const isEncrypted = store.get('apiKeyIsEncrypted', false) as boolean
  const apiKey = raw && isEncrypted
    ? safeStorage.decryptString(Buffer.from(raw, 'base64'))
    : raw as string

  return {
    provider:     (store.get('provider', 'claude') as AppSettings['provider']),
    model:        (store.get('model', 'claude-sonnet-4-6') as string),
    apiKey,
    defaultRubric: (store.get('defaultRubric', DEFAULT_RUBRIC) as RubricConfig),
  }
}
```

**Step 4: Run to verify it passes**

```bash
npx vitest run tests/unit/settings.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add src/main/settings.ts tests/unit/settings.test.ts
git commit -m "feat: add settings module with encrypted API key storage"
```

---

## Phase 4: Text Extraction

### Task 5: HTML text extractor

**Files:**
- Create: `src/main/extractor/html.ts`
- Create: `tests/unit/extractor/html.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/extractor/html.test.ts`:
```ts
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
```

**Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/extractor/html.test.ts
# Expected: FAIL
```

**Step 3: Install cheerio (HTML parsing)**

```bash
npm install cheerio
npm install -D @types/cheerio
```

**Step 4: Implement the HTML extractor**

Create `src/main/extractor/html.ts`:
```ts
import * as cheerio from 'cheerio'

export interface ExtractedText {
  navigation:  string[]
  headings:    string[]
  body:        string[]
  ctaButtons:  string[]
  allText:     string
}

export function extractTextFromHtml(html: string): ExtractedText {
  const $ = cheerio.load(html)

  // Remove noise
  $('script, style, noscript, svg, img').remove()

  const navigation: string[] = []
  const headings:   string[] = []
  const body:       string[] = []
  const ctaButtons: string[] = []

  $('nav a, header a').each((_, el) => {
    const text = $(el).text().trim()
    if (text) navigation.push(text)
  })

  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const text = $(el).text().trim()
    if (text) headings.push(text)
  })

  $('button, [role="button"], input[type="submit"], a.btn, a.button').each((_, el) => {
    const text = ($(el).text() || $(el).val() as string || '').trim()
    if (text) ctaButtons.push(text)
  })

  $('p, li, td, th, label, span, div').each((_, el) => {
    const children = $(el).children()
    if (children.length === 0) {
      const text = $(el).text().trim()
      if (text && text.length > 2) body.push(text)
    }
  })

  const allText = [...navigation, ...headings, ...body, ...ctaButtons]
    .filter((v, i, a) => a.indexOf(v) === i)
    .join('\n')

  return { navigation, headings, body, ctaButtons, allText }
}
```

**Step 5: Run to verify it passes**

```bash
npx vitest run tests/unit/extractor/html.test.ts
# Expected: PASS
```

**Step 6: Commit**

```bash
git add src/main/extractor/html.ts tests/unit/extractor/html.test.ts
git commit -m "feat: add HTML text extractor with section grouping"
```

---

### Task 6: JSON and CSV file parsers

**Files:**
- Create: `src/main/extractor/json.ts`
- Create: `src/main/extractor/csv.ts`
- Create: `tests/unit/extractor/json.test.ts`
- Create: `tests/unit/extractor/csv.test.ts`

**Step 1: Write failing tests for JSON parser**

Create `tests/unit/extractor/json.test.ts`:
```ts
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
```

**Step 2: Write failing test for CSV parser**

Create `tests/unit/extractor/csv.test.ts`:
```ts
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
```

**Step 3: Run to verify they fail**

```bash
npx vitest run tests/unit/extractor/
# Expected: FAIL for both
```

**Step 4: Implement JSON parser**

Create `src/main/extractor/json.ts`:
```ts
export interface TranslationPair {
  key:   string
  value: string
}

function flatten(obj: unknown, prefix = ''): TranslationPair[] {
  const pairs: TranslationPair[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      pairs.push(...flatten(v, fullKey))
    } else if (typeof v === 'string') {
      pairs.push({ key: fullKey, value: v })
    }
  }
  return pairs
}

export function parseJsonTranslations(jsonString: string): TranslationPair[] {
  const parsed = JSON.parse(jsonString) // throws on invalid
  return flatten(parsed)
}
```

**Step 5: Implement CSV parser**

Create `src/main/extractor/csv.ts`:
```ts
import Papa from 'papaparse'
import type { TranslationPair } from './json'

export function parseCsvTranslations(csvString: string): TranslationPair[] {
  const result = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    skipEmptyLines: true,
  })

  const fields = result.meta.fields ?? []
  if (!fields.includes('value')) {
    throw new Error('CSV must have a "value" column. Found: ' + fields.join(', '))
  }

  const keyField = fields.includes('key') ? 'key' : fields[0]

  return result.data.map(row => ({
    key:   row[keyField] ?? '',
    value: row['value'] ?? '',
  }))
}
```

**Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/unit/extractor/
# Expected: PASS all
```

**Step 7: Commit**

```bash
git add src/main/extractor/ tests/unit/extractor/
git commit -m "feat: add JSON and CSV translation file parsers"
```

---

### Task 7: URL fetcher with Puppeteer

**Files:**
- Create: `src/main/extractor/url.ts`

> Note: This module uses Puppeteer and runs in the Electron main process. Unit testing requires a real browser, so we test it integration-style in the e2e phase. For now, write the implementation.

Create `src/main/extractor/url.ts`:
```ts
import puppeteer from 'puppeteer'

export interface FetchResult {
  html: string
  finalUrl: string
  title: string
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
```

**Step 1: Commit**

```bash
git add src/main/extractor/url.ts
git commit -m "feat: add Puppeteer URL fetcher for JS-rendered pages"
```

---

## Phase 5: AI Client & Prompt Engine

### Task 8: AI prompt builder

**Files:**
- Create: `src/main/ai/prompts.ts`
- Create: `tests/unit/ai/prompts.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/ai/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildCategoryPrompt, RUBRIC_CATEGORIES } from '../../../src/main/ai/prompts'

describe('buildCategoryPrompt', () => {
  it('includes source and target locale', () => {
    const prompt = buildCategoryPrompt({
      category: 'accuracy',
      sourceLocale: 'en',
      targetLocale: 'es-MX',
      sourceText: 'Log in',
      targetText: 'Entrar',
      customRules: '',
    })
    expect(prompt).toContain('en')
    expect(prompt).toContain('es-MX')
  })

  it('includes custom rules when provided', () => {
    const prompt = buildCategoryPrompt({
      category: 'tone',
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceText: 'Hey there!',
      targetText: 'Hey!',
      customRules: 'Always use formal Sie pronoun in German.',
    })
    expect(prompt).toContain('formal Sie pronoun')
  })

  it('includes JSON schema instruction in every prompt', () => {
    const prompt = buildCategoryPrompt({
      category: 'fluency',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourceText: 'test',
      targetText: 'test',
      customRules: '',
    })
    expect(prompt).toContain('score')
    expect(prompt).toContain('issues')
  })

  it('covers all rubric categories', () => {
    expect(RUBRIC_CATEGORIES).toEqual(['accuracy', 'fluency', 'completeness', 'tone'])
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/ai/prompts.test.ts
# Expected: FAIL
```

**Step 3: Implement prompt builder**

Create `src/main/ai/prompts.ts`:
```ts
export type RubricCategory = 'accuracy' | 'fluency' | 'completeness' | 'tone'

export const RUBRIC_CATEGORIES: RubricCategory[] = [
  'accuracy', 'fluency', 'completeness', 'tone',
]

const CATEGORY_DESCRIPTIONS: Record<RubricCategory, string> = {
  accuracy:
    'Does the target text convey exactly the same meaning as the source? Flag any mistranslations, omissions, or additions of meaning.',
  fluency:
    'Does the target text read naturally and grammatically in the target language? Flag unnatural phrasing, grammar errors, or awkward constructions.',
  completeness:
    'Are all source strings present in the target? Flag any untranslated strings, placeholder text left in the source language, or missing content.',
  tone:
    'Does the target text match the tone and style of the source (formality, voice, brand language)? Flag mismatches in register or style.',
}

export interface PromptParams {
  category:     RubricCategory
  sourceLocale: string
  targetLocale: string
  sourceText:   string
  targetText:   string
  customRules:  string
}

export function buildCategoryPrompt(params: PromptParams): string {
  const { category, sourceLocale, targetLocale, sourceText, targetText, customRules } = params
  const description = CATEGORY_DESCRIPTIONS[category]

  return `You are a professional translation quality evaluator.

Source language: ${sourceLocale}
Target language: ${targetLocale}

Evaluation focus — ${category.toUpperCase()}: ${description}

Source text:
${sourceText}

Target text:
${targetText}

${customRules ? `Custom rules to enforce:\n${customRules}\n` : ''}
Respond ONLY with a JSON object matching this exact schema:
{
  "score": <integer 0-100>,
  "issues": [
    {
      "original_text": "<exact source phrase>",
      "translated_text": "<exact target phrase as found>",
      "reason": "<why this is an issue>",
      "suggestion": "<improved translation>",
      "severity": "low" | "medium" | "high"
    }
  ]
}

Return an empty issues array if no problems found. Do not include any text outside the JSON.`
}
```

**Step 4: Run to verify it passes**

```bash
npx vitest run tests/unit/ai/prompts.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add src/main/ai/prompts.ts tests/unit/ai/prompts.test.ts
git commit -m "feat: add AI prompt builder for per-category translation evaluation"
```

---

### Task 9: AI provider client (Claude + OpenAI)

**Files:**
- Create: `src/main/ai/index.ts`
- Create: `src/main/ai/claude.ts`
- Create: `src/main/ai/openai.ts`
- Create: `tests/unit/ai/client.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/ai/client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { createAiClient } from '../../../src/main/ai/index'

describe('createAiClient', () => {
  it('returns a client with an evaluate method', () => {
    const client = createAiClient({ provider: 'claude', apiKey: 'test', model: 'claude-sonnet-4-6' })
    expect(typeof client.evaluate).toBe('function')
  })

  it('throws if provider is unknown', () => {
    expect(() =>
      createAiClient({ provider: 'unknown' as any, apiKey: 'x', model: 'x' })
    ).toThrow(/unknown provider/)
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/ai/client.test.ts
# Expected: FAIL
```

**Step 3: Define the provider interface**

Create `src/main/ai/index.ts`:
```ts
import type { RubricCategory } from './prompts'

export interface AiIssue {
  original_text:    string
  translated_text:  string
  reason:           string
  suggestion:       string
  severity:         'low' | 'medium' | 'high'
}

export interface CategoryResult {
  category: RubricCategory
  score:    number
  issues:   AiIssue[]
}

export interface AiClientConfig {
  provider: 'claude' | 'openai'
  apiKey:   string
  model:    string
}

export interface AiClient {
  evaluate(prompt: string): Promise<CategoryResult['issues'] extends infer T ? { score: number; issues: AiIssue[] } : never>
}

export function createAiClient(config: AiClientConfig): { evaluate(prompt: string): Promise<{ score: number; issues: AiIssue[] }> } {
  switch (config.provider) {
    case 'claude':  return createClaudeClient(config)
    case 'openai':  return createOpenAiClient(config)
    default:        throw new Error(`unknown provider: ${config.provider}`)
  }
}

function parseAiResponse(raw: string): { score: number; issues: AiIssue[] } {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON')
  const parsed = JSON.parse(jsonMatch[0])
  return {
    score:  Math.max(0, Math.min(100, Number(parsed.score) || 0)),
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  }
}

function createClaudeClient(config: AiClientConfig) {
  const Anthropic = require('@anthropic-ai/sdk')
  const client = new Anthropic.default({ apiKey: config.apiKey })

  return {
    async evaluate(prompt: string) {
      const msg = await client.messages.create({
        model:      config.model,
        max_tokens: 2048,
        messages:   [{ role: 'user', content: prompt }],
      })
      const text = msg.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
      return parseAiResponse(text)
    },
  }
}

function createOpenAiClient(config: AiClientConfig) {
  const OpenAI = require('openai')
  const client = new OpenAI.default({ apiKey: config.apiKey })

  return {
    async evaluate(prompt: string) {
      const completion = await client.chat.completions.create({
        model:    config.model,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = completion.choices[0]?.message?.content ?? ''
      return parseAiResponse(text)
    },
  }
}
```

**Step 4: Run to verify it passes**

```bash
npx vitest run tests/unit/ai/client.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add src/main/ai/ tests/unit/ai/
git commit -m "feat: add AI client with Claude and OpenAI provider support"
```

---

## Phase 6: Scoring Engine

### Task 10: Weighted scoring engine

**Files:**
- Create: `src/main/scoring/engine.ts`
- Create: `tests/unit/scoring/engine.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/scoring/engine.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeFinalScore, runAudit } from '../../../src/main/scoring/engine'
import type { RubricConfig } from '../../..'  // will add type export

describe('computeFinalScore', () => {
  it('computes weighted average correctly', () => {
    const categoryScores = { accuracy: 80, fluency: 60, completeness: 100, tone: 40 }
    const rubric = {
      accuracy:     { weight: 40 },
      fluency:      { weight: 20 },
      completeness: { weight: 30 },
      tone:         { weight: 10 },
    }
    // 80*40 + 60*20 + 100*30 + 40*10 = 3200+1200+3000+400 = 7800 / 100 = 78
    expect(computeFinalScore(categoryScores, rubric)).toBe(78)
  })

  it('handles a rubric with only one category at full weight', () => {
    const categoryScores = { accuracy: 72, fluency: 0, completeness: 0, tone: 0 }
    const rubric = {
      accuracy:     { weight: 100 },
      fluency:      { weight: 0 },
      completeness: { weight: 0 },
      tone:         { weight: 0 },
    }
    expect(computeFinalScore(categoryScores, rubric)).toBe(72)
  })

  it('returns 0 when all weights are zero', () => {
    const categoryScores = { accuracy: 80, fluency: 60, completeness: 100, tone: 40 }
    const rubric = {
      accuracy:     { weight: 0 },
      fluency:      { weight: 0 },
      completeness: { weight: 0 },
      tone:         { weight: 0 },
    }
    expect(computeFinalScore(categoryScores, rubric)).toBe(0)
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/scoring/engine.test.ts
# Expected: FAIL
```

**Step 3: Implement the scoring engine**

Create `src/main/scoring/engine.ts`:
```ts
import { RUBRIC_CATEGORIES, buildCategoryPrompt } from '../ai/prompts'
import { createAiClient } from '../ai/index'
import type { AiIssue, CategoryResult } from '../ai/index'
import type { RubricConfig } from '../settings'

export interface AuditInput {
  sourceLocale:  string
  targetLocale:  string
  sourceText:    string
  targetText:    string
  customRules:   string
  rubric:        RubricConfig
  aiConfig:      { provider: 'claude' | 'openai'; apiKey: string; model: string }
  onProgress?:   (category: string, done: number, total: number) => void
}

export interface AuditResult {
  categoryResults: CategoryResult[]
  categoryScores:  Record<string, number>
  finalScore:      number
  allIssues:       (AiIssue & { category: string })[]
}

export function computeFinalScore(
  categoryScores: Record<string, number>,
  rubric: RubricConfig
): number {
  const totalWeight = Object.values(rubric).reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) return 0

  const weighted = RUBRIC_CATEGORIES.reduce((sum, cat) => {
    return sum + (categoryScores[cat] ?? 0) * (rubric[cat]?.weight ?? 0)
  }, 0)

  return Math.round(weighted / totalWeight)
}

export async function runAudit(input: AuditInput): Promise<AuditResult> {
  const client = createAiClient(input.aiConfig)
  const categoryResults: CategoryResult[] = []
  const total = RUBRIC_CATEGORIES.length

  for (let i = 0; i < RUBRIC_CATEGORIES.length; i++) {
    const category = RUBRIC_CATEGORIES[i]
    input.onProgress?.(category, i, total)

    const prompt = buildCategoryPrompt({
      category,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText:   input.sourceText,
      targetText:   input.targetText,
      customRules:  input.customRules,
    })

    const result = await client.evaluate(prompt)
    categoryResults.push({ category, ...result })
  }

  input.onProgress?.('done', total, total)

  const categoryScores = Object.fromEntries(
    categoryResults.map(r => [r.category, r.score])
  )

  const finalScore = computeFinalScore(categoryScores, input.rubric)

  const allIssues = categoryResults.flatMap(r =>
    r.issues.map(issue => ({ ...issue, category: r.category }))
  )

  return { categoryResults, categoryScores, finalScore, allIssues }
}
```

**Step 4: Fix the test import** — update `tests/unit/scoring/engine.test.ts` to import `RubricConfig` directly from settings:
```ts
import type { RubricConfig } from '../../../src/main/settings'
```

**Step 5: Run to verify it passes**

```bash
npx vitest run tests/unit/scoring/engine.test.ts
# Expected: PASS
```

**Step 6: Commit**

```bash
git add src/main/scoring/engine.ts tests/unit/scoring/engine.test.ts
git commit -m "feat: add scoring engine with weighted rubric calculation"
```

---

### Task 11: Annotation mapper

**Files:**
- Create: `src/main/scoring/annotations.ts`
- Create: `tests/unit/scoring/annotations.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/scoring/annotations.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildAnnotationScript, type AnnotationIssue } from '../../../src/main/scoring/annotations'

describe('buildAnnotationScript', () => {
  it('returns a self-contained JS string', () => {
    const issues: AnnotationIssue[] = [
      { id: 1, text: 'Log in', category: 'accuracy', severity: 'medium' },
    ]
    const script = buildAnnotationScript(issues)
    expect(typeof script).toBe('string')
    expect(script).toContain('Log in')
    expect(script).toContain('data-audit-id')
  })

  it('escapes single quotes in text', () => {
    const issues: AnnotationIssue[] = [
      { id: 1, text: "don't do this", category: 'tone', severity: 'low' },
    ]
    const script = buildAnnotationScript(issues)
    expect(script).not.toContain("don't") // escaped
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/scoring/annotations.test.ts
# Expected: FAIL
```

**Step 3: Implement annotation mapper**

Create `src/main/scoring/annotations.ts`:
```ts
export interface AnnotationIssue {
  id:       number
  text:     string
  category: string
  severity: 'low' | 'medium' | 'high'
}

const SEVERITY_COLORS: Record<AnnotationIssue['severity'], string> = {
  low:    '#fbbf24',
  medium: '#f97316',
  high:   '#ef4444',
}

/**
 * Builds a JavaScript string to be injected into the webview via
 * executeJavaScript(). It finds text nodes matching each issue and
 * wraps them in a styled <mark> element with a numbered badge.
 */
export function buildAnnotationScript(issues: AnnotationIssue[]): string {
  const issueJson = JSON.stringify(
    issues.map(i => ({
      ...i,
      text: i.text.replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    }))
  )

  return `
(function() {
  const issues = ${issueJson};

  function findAndWrap(text, id, color) {
    const escaped = text.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.includes(text)) {
        const parent = node.parentNode;
        if (!parent || parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE') continue;
        const mark = document.createElement('mark');
        mark.setAttribute('data-audit-id', String(id));
        mark.style.cssText = \`
          background: \${color}33;
          outline: 2px solid \${color};
          border-radius: 2px;
          cursor: pointer;
          position: relative;
        \`;
        mark.title = 'Issue #' + id;

        const badge = document.createElement('sup');
        badge.textContent = String(id);
        badge.style.cssText = \`
          background: \${color};
          color: white;
          border-radius: 50%;
          padding: 1px 4px;
          font-size: 10px;
          font-weight: bold;
          margin-left: 2px;
        \`;

        const range = document.createRange();
        range.selectNode(node);
        range.surroundContents(mark);
        mark.appendChild(badge);

        mark.addEventListener('click', () => {
          window.postMessage({ type: 'audit-annotation-click', id }, '*');
        });
        return true;
      }
    }
    return false;
  }

  issues.forEach(issue => {
    findAndWrap(issue.text, issue.id, '${Object.values(SEVERITY_COLORS)[0]}');
  });
})();
  `.trim()
}
```

> Note: The color lookup per-severity is simplified in the injected script. In a refinement pass, pass the color per-issue in the JSON.

**Step 4: Run to verify it passes**

```bash
npx vitest run tests/unit/scoring/annotations.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add src/main/scoring/annotations.ts tests/unit/scoring/annotations.test.ts
git commit -m "feat: add annotation mapper to inject webview highlights"
```

---

## Phase 7: IPC Layer

### Task 12: IPC channel definitions and handlers

**Files:**
- Create: `src/main/ipc/types.ts`
- Create: `src/main/ipc/audit.ts`
- Create: `src/main/ipc/projects.ts`
- Create: `src/main/ipc/settings.ts`
- Modify: `src/main/index.ts` (main process entry)
- Modify: `src/preload/index.ts`

**Step 1: Define IPC channel type contracts**

Create `src/main/ipc/types.ts`:
```ts
import type { AuditResult } from '../scoring/engine'
import type { AppSettings, RubricConfig } from '../settings'

// ── Projects ──────────────────────────────────────────────
export interface Project {
  id:             string
  name:           string
  base_url:       string | null
  source_locale:  string
  target_locales: string[]
  rubric_config:  RubricConfig
  custom_rules:   string
  created_at:     number
}

// ── Audit request ─────────────────────────────────────────
export type AuditRequest =
  | { type: 'url';  projectId: string; url: string }
  | { type: 'file'; projectId: string; filePath: string; fileType: 'html' | 'json' | 'csv' }

// ── Audit history record ──────────────────────────────────
export interface AuditRecord {
  id:          string
  project_id:  string
  input_type:  'url' | 'file'
  input_ref:   string
  ai_results:  AuditResult['categoryResults']
  final_score: number
  created_at:  number
}

// ── IPC channel map (for type safety) ─────────────────────
export interface IpcChannels {
  'projects:list':   { args: []; result: Project[] }
  'projects:create': { args: [Omit<Project, 'id' | 'created_at'>]; result: Project }
  'projects:update': { args: [string, Partial<Project>]; result: Project }
  'projects:delete': { args: [string]; result: void }
  'audit:run':       { args: [AuditRequest]; result: AuditResult }
  'audit:history':   { args: [string]; result: AuditRecord[] }
  'audit:delete':    { args: [string]; result: void }
  'settings:load':   { args: []; result: AppSettings }
  'settings:save':   { args: [Partial<AppSettings>]; result: void }
  'export:report':   { args: [string]; result: string } // auditId → file path
}
```

**Step 2: Implement audit IPC handler**

Create `src/main/ipc/audit.ts`:
```ts
import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/index'
import { loadSettings } from '../settings'
import { runAudit } from '../scoring/engine'
import { fetchPageHtml } from '../extractor/url'
import { extractTextFromHtml } from '../extractor/html'
import { parseJsonTranslations } from '../extractor/json'
import { parseCsvTranslations } from '../extractor/csv'
import { readFileSync } from 'fs'
import type { AuditRequest } from './types'

export function registerAuditHandlers(): void {
  ipcMain.handle('audit:run', async (_event, req: AuditRequest) => {
    const db = getDb()
    const settings = loadSettings()

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.projectId) as any
    if (!project) throw new Error(`Project ${req.projectId} not found`)

    const rubric = JSON.parse(project.rubric_config)
    const targetLocales: string[] = JSON.parse(project.target_locales)
    const targetLocale = targetLocales[0] ?? 'unknown'

    let sourceText = ''
    let targetText = ''
    let inputRef = ''

    if (req.type === 'url') {
      const fetched = await fetchPageHtml(req.url)
      const extracted = extractTextFromHtml(fetched.html)
      targetText = extracted.allText
      sourceText = targetText // single-language page; AI evaluates in context
      inputRef = req.url
    } else {
      const raw = readFileSync(req.filePath, 'utf-8')
      let pairs: { key: string; value: string }[] = []
      if (req.fileType === 'json') pairs = parseJsonTranslations(raw)
      else if (req.fileType === 'csv') pairs = parseCsvTranslations(raw)
      else {
        const extracted = extractTextFromHtml(raw)
        sourceText = extracted.allText
        targetText = extracted.allText
      }
      if (pairs.length) {
        targetText = pairs.map(p => `${p.key}: ${p.value}`).join('\n')
        sourceText = targetText
      }
      inputRef = req.filePath
    }

    const result = await runAudit({
      sourceLocale: project.source_locale,
      targetLocale,
      sourceText,
      targetText,
      customRules: project.custom_rules,
      rubric,
      aiConfig: {
        provider: settings.provider,
        apiKey:   settings.apiKey,
        model:    settings.model,
      },
    })

    // Persist to DB
    const auditId = randomUUID()
    db.prepare(`
      INSERT INTO audits (id, project_id, input_type, input_ref, ai_results, final_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      req.projectId,
      req.type,
      inputRef,
      JSON.stringify(result.categoryResults),
      result.finalScore,
    )

    return { ...result, auditId }
  })

  ipcMain.handle('audit:history', (_event, projectId: string) => {
    return getDb()
      .prepare('SELECT * FROM audits WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId)
  })

  ipcMain.handle('audit:delete', (_event, auditId: string) => {
    getDb().prepare('DELETE FROM audits WHERE id = ?').run(auditId)
  })
}
```

**Step 3: Implement projects and settings IPC handlers**

Create `src/main/ipc/projects.ts`:
```ts
import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/index'

export function registerProjectHandlers(): void {
  ipcMain.handle('projects:list', () =>
    getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
  )

  ipcMain.handle('projects:create', (_event, data: any) => {
    const id = randomUUID()
    getDb().prepare(`
      INSERT INTO projects (id, name, base_url, source_locale, target_locales, rubric_config, custom_rules)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.base_url ?? null,
      data.source_locale,
      JSON.stringify(data.target_locales ?? []),
      JSON.stringify(data.rubric_config),
      data.custom_rules ?? '',
    )
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  ipcMain.handle('projects:update', (_event, id: string, data: any) => {
    const fields = Object.keys(data)
      .filter(k => !['id', 'created_at'].includes(k))
      .map(k => `${k} = ?`)
      .join(', ')
    const values = Object.keys(data)
      .filter(k => !['id', 'created_at'].includes(k))
      .map(k => typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k])
    getDb().prepare(`UPDATE projects SET ${fields} WHERE id = ?`).run(...values, id)
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  ipcMain.handle('projects:delete', (_event, id: string) => {
    getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  })
}
```

Create `src/main/ipc/settings.ts`:
```ts
import { ipcMain } from 'electron'
import { loadSettings, saveSettings } from '../settings'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_event, partial) => saveSettings(partial))
}
```

**Step 4: Wire handlers into the main process**

Edit `src/main/index.ts` — add these imports and calls in the `app.whenReady()` block:
```ts
import { registerAuditHandlers }    from './ipc/audit'
import { registerProjectHandlers }  from './ipc/projects'
import { registerSettingsHandlers } from './ipc/settings'

// Inside app.whenReady():
registerAuditHandlers()
registerProjectHandlers()
registerSettingsHandlers()
```

**Step 5: Expose IPC to renderer via contextBridge**

Edit `src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  projects: {
    list:   ()              => ipcRenderer.invoke('projects:list'),
    create: (data: any)     => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string)    => ipcRenderer.invoke('projects:delete', id),
  },
  audit: {
    run:     (req: any)     => ipcRenderer.invoke('audit:run', req),
    history: (projectId: string) => ipcRenderer.invoke('audit:history', projectId),
    delete:  (auditId: string)   => ipcRenderer.invoke('audit:delete', auditId),
  },
  settings: {
    load: ()            => ipcRenderer.invoke('settings:load'),
    save: (data: any)   => ipcRenderer.invoke('settings:save', data),
  },
  export: {
    report: (auditId: string) => ipcRenderer.invoke('export:report', auditId),
  },
})
```

**Step 6: Add window.api type declaration**

Create `src/renderer/src/types/api.d.ts`:
```ts
declare global {
  interface Window {
    api: {
      projects: {
        list:   () => Promise<any[]>
        create: (data: any) => Promise<any>
        update: (id: string, data: any) => Promise<any>
        delete: (id: string) => Promise<void>
      }
      audit: {
        run:     (req: any) => Promise<any>
        history: (projectId: string) => Promise<any[]>
        delete:  (auditId: string) => Promise<void>
      }
      settings: {
        load: () => Promise<any>
        save: (data: any) => Promise<void>
      }
      export: {
        report: (auditId: string) => Promise<string>
      }
    }
  }
}
export {}
```

**Step 7: Commit**

```bash
git add src/main/ipc/ src/main/index.ts src/preload/index.ts src/renderer/src/types/
git commit -m "feat: add IPC handlers and contextBridge for all channels"
```

---

## Phase 8: React UI Shell

### Task 13: App shell with 3-panel layout and routing

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/layout/AppShell.tsx`
- Create: `src/renderer/src/components/layout/Sidebar.tsx`

**Step 1: Install React Router**

```bash
npm install react-router-dom
```

**Step 2: Implement the Sidebar**

Create `src/renderer/src/components/layout/Sidebar.tsx`:
```tsx
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/',         label: 'Audit',    icon: '🔍' },
  { to: '/history',  label: 'History',  icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Sidebar() {
  return (
    <aside className="w-48 bg-gray-900 text-gray-100 flex flex-col py-4 gap-1 shrink-0">
      <div className="px-4 py-2 text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Translation Auditor
      </div>
      {links.map(link => (
        <NavLink
          key={link.to}
          to={link.to}
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 text-sm rounded mx-2 transition-colors ${
              isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'
            }`
          }
        >
          <span>{link.icon}</span>
          <span>{link.label}</span>
        </NavLink>
      ))}
    </aside>
  )
}
```

**Step 3: Implement AppShell**

Create `src/renderer/src/components/layout/AppShell.tsx`:
```tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-950 text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

**Step 4: Set up App.tsx with routes**

Edit `src/renderer/src/App.tsx`:
```tsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AuditPage } from './pages/AuditPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<AuditPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
```

**Step 5: Create stub page components**

```bash
mkdir -p src/renderer/src/pages
```

Create `src/renderer/src/pages/AuditPage.tsx`:
```tsx
export function AuditPage() {
  return <div className="p-6 text-gray-300">Audit page — coming soon</div>
}
```

Create `src/renderer/src/pages/HistoryPage.tsx`:
```tsx
export function HistoryPage() {
  return <div className="p-6 text-gray-300">History — coming soon</div>
}
```

Create `src/renderer/src/pages/SettingsPage.tsx`:
```tsx
export function SettingsPage() {
  return <div className="p-6 text-gray-300">Settings — coming soon</div>
}
```

**Step 6: Commit**

```bash
git add src/renderer/src/
git commit -m "feat: add app shell with 3-panel layout and React Router"
```

---

## Phase 9: Settings Page

### Task 14: Settings page — AI provider configuration

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

Replace the stub with:
```tsx
import { useState, useEffect } from 'react'

const PROVIDERS = [
  { id: 'claude', label: 'Anthropic Claude', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'] },
  { id: 'openai', label: 'OpenAI',           models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
]

export function SettingsPage() {
  const [provider, setProvider] = useState('claude')
  const [model, setModel]       = useState('claude-sonnet-4-6')
  const [apiKey, setApiKey]     = useState('')
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    window.api.settings.load().then(s => {
      setProvider(s.provider ?? 'claude')
      setModel(s.model ?? 'claude-sonnet-4-6')
      setApiKey(s.apiKey ?? '')
    })
  }, [])

  const models = PROVIDERS.find(p => p.id === provider)?.models ?? []

  async function handleSave() {
    await window.api.settings.save({ provider: provider as any, model, apiKey })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">AI Provider</label>
          <select
            value={provider}
            onChange={e => { setProvider(e.target.value); setModel(PROVIDERS.find(p => p.id === e.target.value)!.models[0]) }}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Model</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">Stored securely using OS-level encryption.</p>
        </div>

        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium"
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
```

**Step 1: Commit**

```bash
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat: add settings page with AI provider and API key configuration"
```

---

## Phase 10: Audit Page — Score Panel & Rubric Sliders

### Task 15: Score display and rubric sliders with live recalculation

**Files:**
- Create: `src/renderer/src/components/audit/ScorePanel.tsx`
- Create: `src/renderer/src/hooks/useScore.ts`

**Step 1: Create the live-recalculation hook**

Create `src/renderer/src/hooks/useScore.ts`:
```ts
import { useState, useCallback } from 'react'

export interface RubricWeights {
  accuracy:     number
  fluency:      number
  completeness: number
  tone:         number
}

export interface CategoryScores {
  accuracy?:     number
  fluency?:      number
  completeness?: number
  tone?:         number
}

export function useScore(initialWeights: RubricWeights) {
  const [weights, setWeights]         = useState<RubricWeights>(initialWeights)
  const [categoryScores, setScores]   = useState<CategoryScores>({})

  const computedScore = (() => {
    const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0)
    if (totalWeight === 0) return 0
    const weighted = (Object.keys(weights) as (keyof RubricWeights)[]).reduce((sum, cat) => {
      return sum + (categoryScores[cat] ?? 0) * weights[cat]
    }, 0)
    return Math.round(weighted / totalWeight)
  })()

  const updateWeight = useCallback((cat: keyof RubricWeights, value: number) => {
    setWeights(prev => ({ ...prev, [cat]: value }))
  }, [])

  return { weights, updateWeight, categoryScores, setScores, computedScore }
}
```

**Step 2: Create the ScorePanel component**

Create `src/renderer/src/components/audit/ScorePanel.tsx`:
```tsx
import type { RubricWeights, CategoryScores } from '../../hooks/useScore'

interface Props {
  score:           number
  weights:         RubricWeights
  categoryScores:  CategoryScores
  onWeightChange:  (cat: keyof RubricWeights, value: number) => void
  customRules:     string
  onCustomRules:   (v: string) => void
  disabled:        boolean
}

const CATEGORIES: { key: keyof RubricWeights; label: string }[] = [
  { key: 'accuracy',     label: 'Accuracy' },
  { key: 'fluency',      label: 'Fluency' },
  { key: 'completeness', label: 'Completeness' },
  { key: 'tone',         label: 'Tone & Style' },
]

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

export function ScorePanel({ score, weights, categoryScores, onWeightChange, customRules, onCustomRules, disabled }: Props) {
  return (
    <div className="p-4 border-b border-gray-800 space-y-4">
      <div className="flex items-center gap-4">
        <div className={`text-4xl font-bold ${scoreColor(score)}`}>{score}</div>
        <div className="text-gray-400 text-sm">/100</div>
        <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {CATEGORIES.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-28 text-xs text-gray-400 shrink-0">{label}</span>
            <input
              type="range"
              min={0} max={100}
              value={weights[key]}
              onChange={e => onWeightChange(key, Number(e.target.value))}
              disabled={disabled}
              className="flex-1 accent-blue-500"
            />
            <span className="w-8 text-xs text-right text-gray-300">{weights[key]}%</span>
            {categoryScores[key] !== undefined && (
              <span className={`w-8 text-xs text-right ${scoreColor(categoryScores[key]!)}`}>
                {categoryScores[key]}
              </span>
            )}
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Custom Rules</label>
        <textarea
          value={customRules}
          onChange={e => onCustomRules(e.target.value)}
          placeholder="e.g. Never translate the brand name 'Acme'. Use formal pronouns."
          disabled={disabled}
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 resize-none"
        />
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/renderer/src/components/audit/ src/renderer/src/hooks/
git commit -m "feat: add score panel with live-recalculating rubric sliders"
```

---

## Phase 11: Audit Panel — URL Input & File Drop

### Task 16: Audit panel with URL input and file dropzone

**Files:**
- Create: `src/renderer/src/components/audit/AuditPanel.tsx`

Create `src/renderer/src/components/audit/AuditPanel.tsx`:
```tsx
import { useState } from 'react'

type InputMode = 'url' | 'file'

interface Props {
  projectId:  string
  onResult:   (result: any) => void
  onProgress: (step: string) => void
}

export function AuditPanel({ projectId, onResult, onProgress }: Props) {
  const [mode, setMode]         = useState<InputMode>('url')
  const [url, setUrl]           = useState('')
  const [filePath, setFilePath] = useState('')
  const [fileType, setFileType] = useState<'html' | 'json' | 'csv'>('json')
  const [running, setRunning]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleAudit() {
    setRunning(true)
    setError(null)
    try {
      const req = mode === 'url'
        ? { type: 'url' as const, projectId, url }
        : { type: 'file' as const, projectId, filePath, fileType }
      onProgress('Starting audit...')
      const result = await window.api.audit.run(req)
      onResult(result)
    } catch (e: any) {
      setError(e.message ?? 'Audit failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        {(['url', 'file'] as InputMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 text-sm rounded ${mode === m ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            {m === 'url' ? 'URL' : 'File Upload'}
          </button>
        ))}
      </div>

      {mode === 'url' ? (
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com/es/"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={filePath}
            readOnly
            placeholder="Drop file or click Browse"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />
          <select
            value={fileType}
            onChange={e => setFileType(e.target.value as any)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm"
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="html">HTML</option>
          </select>
          <button
            onClick={async () => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.json,.csv,.html'
              input.onchange = () => setFilePath(input.files?.[0]?.path ?? '')
              input.click()
            }}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm"
          >
            Browse
          </button>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded px-3 py-2">{error}</p>
      )}

      <button
        onClick={handleAudit}
        disabled={running || (!url && !filePath)}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-2 rounded text-sm font-medium w-full"
      >
        {running ? 'Auditing...' : 'Run Audit'}
      </button>
    </div>
  )
}
```

**Step 1: Commit**

```bash
git add src/renderer/src/components/audit/AuditPanel.tsx
git commit -m "feat: add audit panel with URL input and file upload"
```

---

## Phase 12: Annotated Webview & Comments Panel

### Task 17: Annotated webview component

**Files:**
- Create: `src/renderer/src/components/audit/AnnotatedWebview.tsx`
- Create: `src/renderer/src/components/audit/CommentsPanel.tsx`

Create `src/renderer/src/components/audit/AnnotatedWebview.tsx`:
```tsx
import { useRef, useEffect } from 'react'

interface AnnotationIssue {
  id:       number
  text:     string
  category: string
  severity: 'low' | 'medium' | 'high'
}

interface Props {
  url:              string | null
  issues:           AnnotationIssue[]
  activeIssueId:    number | null
  onAnnotationClick: (id: number) => void
}

export function AnnotatedWebview({ url, issues, activeIssueId, onAnnotationClick }: Props) {
  const webviewRef = useRef<Electron.WebviewTag>(null)

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv || !url) return

    const injectAnnotations = () => {
      if (!issues.length) return
      const script = buildAnnotationScript(issues)
      wv.executeJavaScript(script).catch(console.error)
    }

    wv.addEventListener('dom-ready', injectAnnotations)
    return () => wv.removeEventListener('dom-ready', injectAnnotations)
  }, [url, issues])

  // Receive click events from the injected script
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return
    const handler = (e: any) => {
      if (e.channel === 'audit-annotation-click') {
        onAnnotationClick(e.args[0])
      }
    }
    wv.addEventListener('ipc-message', handler)
    return () => wv.removeEventListener('ipc-message', handler)
  }, [onAnnotationClick])

  if (!url) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Enter a URL and run an audit to see the annotated page.
      </div>
    )
  }

  return (
    <webview
      ref={webviewRef as any}
      src={url}
      className="w-full h-full"
      nodeintegration={false as any}
    />
  )
}

// Inline version of annotation script builder (avoids main-process import in renderer)
function buildAnnotationScript(issues: AnnotationIssue[]): string {
  return `
(function() {
  const issues = ${JSON.stringify(issues)};
  const COLORS = { low: '#fbbf24', medium: '#f97316', high: '#ef4444' };

  issues.forEach(issue => {
    const color = COLORS[issue.severity] || COLORS.medium;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.includes(issue.text)) {
        const parent = node.parentNode;
        if (!parent || ['SCRIPT','STYLE'].includes(parent.nodeName)) continue;
        const mark = document.createElement('mark');
        mark.setAttribute('data-audit-id', String(issue.id));
        mark.style.cssText = 'background:' + color + '33;outline:2px solid ' + color + ';border-radius:2px;cursor:pointer;';
        const badge = document.createElement('sup');
        badge.textContent = String(issue.id);
        badge.style.cssText = 'background:' + color + ';color:white;border-radius:50%;padding:1px 4px;font-size:10px;font-weight:bold;margin-left:2px;';
        try {
          const range = document.createRange();
          range.selectNode(node);
          range.surroundContents(mark);
          mark.appendChild(badge);
          mark.addEventListener('click', () => {
            require('electron').ipcRenderer.sendToHost('audit-annotation-click', issue.id);
          });
        } catch(e) { /* node already wrapped */ }
        break;
      }
    }
  });
})();
  `
}
```

**Step 1: Create the Comments Panel**

Create `src/renderer/src/components/audit/CommentsPanel.tsx`:
```tsx
import { useEffect, useRef } from 'react'

interface Issue {
  id:             number
  category:       string
  original_text:  string
  translated_text: string
  reason:         string
  suggestion:     string
  severity:       'low' | 'medium' | 'high'
}

interface Props {
  issues:         Issue[]
  activeId:       number | null
  onIssueClick:   (id: number) => void
  onExport:       () => void
}

const SEVERITY_BADGE: Record<Issue['severity'], string> = {
  low:    'bg-yellow-800 text-yellow-200',
  medium: 'bg-orange-800 text-orange-200',
  high:   'bg-red-800 text-red-200',
}

export function CommentsPanel({ issues, activeId, onIssueClick, onExport }: Props) {
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeId])

  return (
    <div className="w-72 shrink-0 border-l border-gray-800 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-sm font-medium">{issues.length} issues</span>
        <button
          onClick={onExport}
          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
        >
          Export Report
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
        {issues.map(issue => (
          <div
            key={issue.id}
            ref={activeId === issue.id ? activeRef : null}
            onClick={() => onIssueClick(issue.id)}
            className={`p-3 cursor-pointer text-sm transition-colors ${
              activeId === issue.id ? 'bg-blue-900' : 'hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-gray-500 font-mono text-xs">#{issue.id}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${SEVERITY_BADGE[issue.severity]}`}>
                {issue.severity}
              </span>
              <span className="text-xs text-gray-400 capitalize">{issue.category}</span>
            </div>
            <p className="text-gray-300 line-through text-xs">{issue.translated_text}</p>
            <p className="text-green-400 text-xs mt-0.5">→ {issue.suggestion}</p>
            <p className="text-gray-500 text-xs mt-1">{issue.reason}</p>
          </div>
        ))}

        {issues.length === 0 && (
          <div className="p-6 text-center text-gray-500 text-sm">
            No issues found. Run an audit to see suggestions.
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/audit/
git commit -m "feat: add annotated webview and comments panel with bidirectional linking"
```

---

## Phase 13: Assemble the Audit Page

### Task 18: Wire all audit components into AuditPage

**Files:**
- Modify: `src/renderer/src/pages/AuditPage.tsx`

```tsx
import { useState } from 'react'
import { AuditPanel } from '../components/audit/AuditPanel'
import { ScorePanel } from '../components/audit/ScorePanel'
import { AnnotatedWebview } from '../components/audit/AnnotatedWebview'
import { CommentsPanel } from '../components/audit/CommentsPanel'
import { useScore } from '../hooks/useScore'

const DEFAULT_WEIGHTS = { accuracy: 40, fluency: 20, completeness: 30, tone: 10 }
const DEFAULT_PROJECT_ID = 'default'

export function AuditPage() {
  const { weights, updateWeight, categoryScores, setScores, computedScore } = useScore(DEFAULT_WEIGHTS)
  const [auditResult, setAuditResult]   = useState<any>(null)
  const [activeIssueId, setActiveId]    = useState<number | null>(null)
  const [progress, setProgress]         = useState<string>('')
  const [auditedUrl, setAuditedUrl]     = useState<string | null>(null)
  const [customRules, setCustomRules]   = useState('')

  function handleResult(result: any) {
    setAuditResult(result)
    const scores: any = {}
    result.categoryResults?.forEach((r: any) => { scores[r.category] = r.score })
    setScores(scores)
  }

  const issues = auditResult?.allIssues?.map((issue: any, i: number) => ({
    ...issue,
    id: i + 1,
  })) ?? []

  async function handleExport() {
    if (!auditResult?.auditId) return
    const path = await window.api.export.report(auditResult.auditId)
    alert(`Report exported to: ${path}`)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top: audit controls + score */}
      <div className="border-b border-gray-800">
        <AuditPanel
          projectId={DEFAULT_PROJECT_ID}
          onResult={handleResult}
          onProgress={setProgress}
        />
        {progress && !auditResult && (
          <p className="px-4 pb-2 text-xs text-blue-400 animate-pulse">{progress}</p>
        )}
        <ScorePanel
          score={computedScore}
          weights={weights}
          categoryScores={categoryScores}
          onWeightChange={updateWeight}
          customRules={customRules}
          onCustomRules={setCustomRules}
          disabled={!auditResult}
        />
      </div>

      {/* Bottom: webview + comments */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <AnnotatedWebview
            url={auditedUrl}
            issues={issues}
            activeIssueId={activeIssueId}
            onAnnotationClick={setActiveId}
          />
        </div>
        <CommentsPanel
          issues={issues}
          activeId={activeIssueId}
          onIssueClick={setActiveId}
          onExport={handleExport}
        />
      </div>
    </div>
  )
}
```

**Step 1: Commit**

```bash
git add src/renderer/src/pages/AuditPage.tsx
git commit -m "feat: wire audit page with all components and live scoring"
```

---

## Phase 14: History View

### Task 19: History page with past audit list

**Files:**
- Modify: `src/renderer/src/pages/HistoryPage.tsx`

```tsx
import { useEffect, useState } from 'react'

export function HistoryPage() {
  const [audits, setAudits] = useState<any[]>([])

  useEffect(() => {
    // For now, load all audits from the default project
    // In a full implementation, list across projects
    window.api.audit.history('default').then(setAudits).catch(console.error)
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Audit History</h1>
      {audits.length === 0 ? (
        <p className="text-gray-500 text-sm">No audits yet. Run your first audit to see history here.</p>
      ) : (
        <div className="space-y-2">
          {audits.map(audit => (
            <div key={audit.id} className="bg-gray-800 rounded p-4 flex items-center gap-4">
              <div className="text-2xl font-bold text-blue-400">{Math.round(audit.final_score)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{audit.input_ref}</p>
                <p className="text-xs text-gray-400">
                  {audit.input_type.toUpperCase()} · {new Date(audit.created_at * 1000).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => window.api.audit.delete(audit.id).then(() => setAudits(a => a.filter(x => x.id !== audit.id)))}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 1: Commit**

```bash
git add src/renderer/src/pages/HistoryPage.tsx
git commit -m "feat: add history page with past audits list"
```

---

## Phase 15: Report Export

### Task 20: HTML/PDF report export

**Files:**
- Create: `src/main/ipc/export.ts`
- Modify: `src/main/index.ts`

Create `src/main/ipc/export.ts`:
```ts
import { ipcMain, BrowserWindow } from 'electron'
import { getDb } from '../db/index'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export function registerExportHandlers(): void {
  ipcMain.handle('export:report', async (_event, auditId: string) => {
    const db = getDb()
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(auditId) as any
    if (!audit) throw new Error('Audit not found')

    const categories = JSON.parse(audit.ai_results ?? '[]')
    const html = buildReportHtml(audit, categories)

    const outDir = app.getPath('downloads')
    const htmlPath = path.join(outDir, `audit-report-${auditId.slice(0, 8)}.html`)
    fs.writeFileSync(htmlPath, html, 'utf-8')

    return htmlPath
  })
}

function buildReportHtml(audit: any, categories: any[]): string {
  const issueRows = categories.flatMap((cat: any) =>
    (cat.issues ?? []).map((issue: any) => `
      <tr>
        <td>${cat.category}</td>
        <td>${issue.severity}</td>
        <td><del>${escHtml(issue.translated_text)}</del></td>
        <td>${escHtml(issue.suggestion)}</td>
        <td>${escHtml(issue.reason)}</td>
      </tr>
    `)
  ).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Translation Audit Report</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; color: #1a1a1a; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .meta { color: #666; font-size: 0.85rem; margin-bottom: 2rem; }
  .score { font-size: 3rem; font-weight: bold; color: ${audit.final_score >= 80 ? 'green' : audit.final_score >= 60 ? 'orange' : 'red'}; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { background: #f0f0f0; text-align: left; padding: 8px; }
  td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  del { color: #999; }
</style>
</head>
<body>
  <h1>Translation Audit Report</h1>
  <div class="meta">
    ${escHtml(audit.input_ref)} &mdash;
    ${new Date(audit.created_at * 1000).toLocaleString()}
  </div>
  <div class="score">${Math.round(audit.final_score)}<span style="font-size:1rem;color:#666">/100</span></div>
  <h2 style="margin-top:2rem">Issues</h2>
  <table>
    <thead><tr><th>Category</th><th>Severity</th><th>Found</th><th>Suggestion</th><th>Reason</th></tr></thead>
    <tbody>${issueRows || '<tr><td colspan="5">No issues found.</td></tr>'}</tbody>
  </table>
</body>
</html>`
}

function escHtml(s: string = ''): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

Add to `src/main/index.ts`:
```ts
import { registerExportHandlers } from './ipc/export'
// In app.whenReady():
registerExportHandlers()
```

**Step 1: Commit**

```bash
git add src/main/ipc/export.ts src/main/index.ts
git commit -m "feat: add HTML report export to downloads folder"
```

---

## Phase 16: E2E Tests

### Task 21: Playwright e2e test for core audit flow

**Files:**
- Create: `tests/e2e/audit.spec.ts`
- Create: `playwright.config.ts`

**Step 1: Create playwright config for Electron**

Create `playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    // electron-specific config is set per-test
  },
})
```

**Step 2: Write the e2e test**

Create `tests/e2e/audit.spec.ts`:
```ts
import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

test('shows score panel on load', async () => {
  await expect(page.locator('text=/\\d+\\/100/')).toBeVisible()
})

test('adjusting rubric slider does not trigger a new API call', async () => {
  let apiCallCount = 0
  page.on('request', req => {
    if (req.url().includes('anthropic') || req.url().includes('openai')) apiCallCount++
  })

  // Move a slider
  const slider = page.locator('input[type="range"]').first()
  await slider.fill('50')
  await page.waitForTimeout(500)

  expect(apiCallCount).toBe(0)
})

test('navigates to settings page', async () => {
  await page.click('text=Settings')
  await expect(page.locator('text=AI Provider')).toBeVisible()
})
```

**Step 3: Run unit tests to confirm all pass**

```bash
npx vitest run
# Expected: All unit tests PASS
```

**Step 4: Build the app and run e2e tests**

```bash
npm run build
npx playwright test tests/e2e/
# Expected: All e2e tests PASS (or skip with known failures from missing API key)
```

**Step 5: Final commit**

```bash
git add tests/e2e/ playwright.config.ts
git commit -m "test: add playwright e2e tests for core audit flow"
```

---

## Summary of Commits

By the end of this plan, the git log should contain approximately:

1. `chore: scaffold electron-vite react-ts project`
2. `chore: install dependencies and configure tailwind + vitest`
3. `feat: add database schema with projects and audits tables`
4. `feat: add settings module with encrypted API key storage`
5. `feat: add HTML text extractor with section grouping`
6. `feat: add JSON and CSV translation file parsers`
7. `feat: add Puppeteer URL fetcher for JS-rendered pages`
8. `feat: add AI prompt builder for per-category translation evaluation`
9. `feat: add AI client with Claude and OpenAI provider support`
10. `feat: add scoring engine with weighted rubric calculation`
11. `feat: add annotation mapper to inject webview highlights`
12. `feat: add IPC handlers and contextBridge for all channels`
13. `feat: add app shell with 3-panel layout and React Router`
14. `feat: add settings page with AI provider and API key configuration`
15. `feat: add score panel with live-recalculating rubric sliders`
16. `feat: add audit panel with URL input and file upload`
17. `feat: add annotated webview and comments panel with bidirectional linking`
18. `feat: wire audit page with all components and live scoring`
19. `feat: add history page with past audits list`
20. `feat: add HTML report export to downloads folder`
21. `test: add playwright e2e tests for core audit flow`

# Translation Auditor — Design Document

**Date:** 2026-02-18
**Status:** Approved

---

## Overview

An Electron desktop application that lets product managers audit websites and translation files for translation quality. It scores pages across weighted rubric categories using an AI service, surfaces annotated improvement suggestions directly on a rendered view of the audited content, and maintains a local history of past audits with exportable reports.

---

## Primary User

**Product manager / content owner** — a non-technical stakeholder who periodically spot-checks live sites and pre-deployment translation bundles to ensure quality is maintained across locales.

---

## Architecture

**Stack:** Electron + Vite + React + TypeScript (`electron-vite` scaffold)

### Process Boundary

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  AI Client  │  │  Web Fetcher │  │  File Parser  │  │
│  │ (Claude /   │  │ (Puppeteer)  │  │ (HTML/JSON/   │  │
│  │  OpenAI)    │  │              │  │  CSV)         │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│         │                │                  │           │
│  ┌──────▼──────────────────────────────────▼─────────┐  │
│  │              Scoring Engine                        │  │
│  │  - Applies rubric weights + custom rules           │  │
│  │  - Issues structured AI calls per category        │  │
│  │  - Returns scored result with issue list           │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                              │
│  ┌────────────────────────▼───────────────────────────┐  │
│  │         SQLite (better-sqlite3)                    │  │
│  │  Projects · Audits · Scores · History              │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │ IPC (typed handlers)         │
└───────────────────────────┼──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│                   React Renderer (Vite)                   │
│  Audit Panel · Score Display · Annotated Webview         │
│  Comments Panel · History View · Settings Panel          │
└───────────────────────────────────────────────────────────┘
```

**Security rules:**
- API keys live only in the main process, stored via `electron-store` + `safeStorage` OS-level encryption
- Webview runs sandboxed (`nodeIntegration: false`); content script injection is limited to text-node highlighting
- URL fetching occurs only in the main process, never the renderer

---

## Data Model

### Project
```
id, name, base_url (optional), source_locale, target_locale[],
rubric_config (JSON), custom_rules (text), created_at
```

### RubricConfig
```json
{
  "accuracy":     { "weight": 40 },
  "fluency":      { "weight": 20 },
  "completeness": { "weight": 30 },
  "tone":         { "weight": 10 }
}
```
Weights are integers 0–100; must sum to 100. Adjustable per project via sliders.

### Audit
```
id, project_id, input_type (url|file), input_ref,
extracted_text (JSON), ai_results (JSON), final_score (0-100),
created_at
```

### AuditIssue (within ai_results)
```json
{
  "category": "accuracy",
  "score": 62,
  "issues": [
    {
      "original_text": "Log in",
      "translated_text": "Entrar",
      "reason": "Preferred term is 'Ingresar' per brand guidelines",
      "suggestion": "Ingresar",
      "severity": "medium"
    }
  ]
}
```

---

## Scoring Engine

### Score Calculation
```
final_score = Σ(category_weight × category_score) / Σ(weights)
```

Per-category scores are cached per audit. When the PM adjusts a rubric slider:
1. Recalculate `final_score` locally from cached values — **no API call**
2. Update the score display and rubric visualization instantly

A "Re-audit" button triggers a fresh API call when the PM wants to re-analyze after page changes.

### AI Prompt Strategy

Each rubric category gets its own focused, structured call:

> *"You are a translation quality evaluator. Source language: [en]. Target language: [es-MX]. Evaluate ONLY [category]. Return JSON: `{ score: 0-100, issues: [{ original_text, translated_text, reason, suggestion, severity }] }`. Custom rules: [user rules]."*

Structured output (JSON mode) is enforced on both Claude and OpenAI to ensure reliable parsing. Custom rules are appended to every category prompt for the project.

---

## UI Layout

### 3-Panel Layout with Annotated Webview

```
┌──────────┬───────────────────────────────────────┬──────────────────┐
│          │        Score & Rubric Panel            │                  │
│ Sidebar  │  SCORE: 78/100  [████████░░░░]        │  Comments Panel  │
│          │  Accuracy    [====|----] 40%           │                  │
│ Projects │  Fluency     [==|------] 20%           │  [1] Accuracy    │
│          │  Completeness[===|-----] 30%           │  "Log in" →      │
│ History  │  Tone        [=|-------] 10%           │  "Ingresar"      │
│          │  Custom rules: [text area]             │                  │
│ Settings ├────────────────────────────────────────│  [2] Completeness│
│          │  Rendered Webpage (sandboxed webview)  │  3 strings       │
│          │                                        │  untranslated    │
│          │  ┌──────────────────────────────────┐  │                  │
│          │  │ Welcome to our [!①] platform     │  │  [3] Tone        │
│          │  │                                  │  │  "Hey there!" is │
│          │  │ Log in [!②] to continue          │  │  too casual      │
│          │  │                                  │  │                  │
│          │  │ [!③] (untranslated placeholder)  │  │  [Export Report] │
│          │  └──────────────────────────────────┘  │                  │
└──────────┴───────────────────────────────────────┴──────────────────┘
```

For **file uploads** (JSON/CSV), the webview is replaced with a **table view** of translation string pairs, with the same numbered annotation pattern applied to flagged rows.

### Annotation Behaviour
- A content script is injected into the webview to find and highlight text nodes matching `issue.original_text` / `issue.translated_text`
- Numbered badges (`①`, `②`) overlay the offending text
- Clicking a badge scrolls the Comments Panel to the matching suggestion
- Clicking a comment card scrolls the webview to the corresponding annotation
- If a text node cannot be found in the DOM, the suggestion is shown in the Comments Panel without a webview overlay (graceful degradation)

---

## Audit Flow (URL Mode)

```
1. User enters URL + clicks "Audit"
2. Main: Puppeteer fetches page (handles JS-rendered content)
3. Main: Extract text → group by section (nav, headings, body, CTAs)
4. Main: For each rubric category → structured AI call with weights + custom rules
5. AI returns: { score, issues[] } per category
6. Scoring engine: compute final_score from weights
7. Annotation mapper: match issue.text → DOM node positions
8. Persist audit to SQLite
9. IPC → renderer: full AuditResult object
10. UI: score animates in, webview highlights appear, comments panel populates
```

---

## AI Provider Configuration

Settings panel exposes:
- **Provider selector**: Claude / OpenAI (extensible)
- **API key input** (masked, stored via safeStorage)
- **Model selector** (e.g. claude-sonnet-4-6, gpt-4o)
- **Default rubric weights** (overridable per project)

---

## Error Handling

| Scenario | Handling |
|---|---|
| URL fetch fails (auth wall, timeout) | Inline error: suggest HTML file upload as fallback |
| API key missing / invalid | Block audit button; banner → Settings |
| AI rate limit / error | Retry once (backoff); show partial results from completed categories |
| Target locale not detected on page | Warn before running full audit |
| Annotation text not found in DOM | Skip overlay; suggestion still shown in Comments Panel |
| File parse error (malformed JSON/CSV) | Show error with offending line number |
| No internet | Show last cached audit result if available |

---

## Testing Strategy

### Unit tests (Vitest)
- Scoring engine: weighted calculation, edge cases (zero weights, single category)
- Text extractor: HTML/JSON/CSV parsing → correct string pairs
- Annotation mapper: text-to-position matching logic
- AI prompt builder: correct locale, custom rules, category focus per call

### Integration tests
- Mock AI provider → full audit flow via IPC without live API calls
- SQLite: audit history CRUD, project persistence

### E2E tests (Playwright for Electron)
- Audit a static local HTML fixture → verify score displays correctly
- Adjust rubric slider → verify score updates without triggering an API call
- Export a report → verify file is created with expected content

---

## Technology Choices

| Concern | Choice | Reason |
|---|---|---|
| Electron scaffold | `electron-vite` | Modern, fast HMR, recommended by Electron team |
| UI framework | React + TypeScript | State management for live score updates |
| Styling | Tailwind CSS | Fast, consistent, no CSS file bloat |
| Database | `better-sqlite3` | Synchronous, embedded, zero config |
| Settings/secrets | `electron-store` + `safeStorage` | OS-level key encryption |
| Web fetching | Puppeteer | Handles JS-rendered pages |
| File parsing | `papaparse` (CSV), native JSON | Lightweight, well-tested |
| Report export | `@electron/pdf` or HTML template → print | Native PDF via Electron |
| Testing (unit) | Vitest | Co-located with Vite toolchain |
| Testing (e2e) | Playwright + `playwright-electron` | Official Electron support |

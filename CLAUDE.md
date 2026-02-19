# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev           # Start Electron app with HMR

# Type checking
npm run typecheck     # Run both node and web typechecks
npm run typecheck:node
npm run typecheck:web

# Linting & formatting
npm run lint
npm run format

# Unit tests (Vitest, node environment)
npm test              # Run all unit tests once
npm run test:watch    # Watch mode
# Run a single test file:
npx vitest run tests/unit/ai/client.test.ts

# E2E tests (Playwright + Electron)
npm run test:e2e

# Build
npm run build:mac
npm run build:win
npm run build:linux
```

**Note:** `npm test` rebuilds `better-sqlite3` before running and reinstalls electron app deps after — this is expected and intentional.

## Architecture

This is an Electron app using `electron-vite` for the build pipeline. It follows the standard Electron three-process model:

### Main Process (`src/main/`)
Handles all privileged operations: file system, database, AI API calls, and settings.

- **`index.ts`** — App entry. Initializes DB at `userData/auditor.db`, registers IPC handlers, creates the BrowserWindow.
- **`db/`** — `better-sqlite3` wrapper. `schema.ts` defines two tables: `projects` and `audits`. JSON fields (`target_locales`, `rubric_config`, `ai_results`) are stored as serialized strings and must be `JSON.parse`d when read.
- **`settings.ts`** — `electron-store` backed settings. API keys are encrypted via Electron's `safeStorage` when available, stored as base64.
- **`ipc/`** — One file per domain (`audit.ts`, `projects.ts`, `settings.ts`, `export.ts`). Each exports a `register*Handlers()` function that wires up `ipcMain.handle` calls.
- **`extractor/`** — Input parsing: `url.ts` (puppeteer-based scraping), `html.ts` (cheerio), `json.ts`, `csv.ts` (papaparse).
- **`ai/`** — AI client abstraction. `index.ts` defines `AiClient` interface with two implementations (Claude via `@anthropic-ai/sdk`, OpenAI via `openai`). `prompts.ts` builds per-category evaluation prompts. AI clients are created with `require()` at call time (not static imports) to avoid Electron module loading issues.
- **`scoring/engine.ts`** — Orchestrates an audit: iterates over the 4 rubric categories (`accuracy`, `fluency`, `completeness`, `tone`), calls the AI client for each, then computes a weighted final score.

### Preload (`src/preload/index.ts`)
Exposes `window.api` to the renderer via `contextBridge`. The full API surface is typed in `src/renderer/src/types/api.d.ts`.

### Renderer (`src/renderer/src/`)
Standard React 19 + React Router 7 (HashRouter) SPA.

- **`App.tsx`** — Root. Checks for a saved API key on load; shows `OnboardingWizard` if none found.
- **`pages/`** — `AuditPage` (run new audit), `HistoryPage` (past audits per project), `SettingsPage` (AI provider/key/rubric weights).
- **`components/audit/`** — `AuditPanel` (input form + results), `AnnotatedWebview` (annotated HTML preview), `ScorePanel`, `CommentsPanel`.
- All renderer→main communication goes through `window.api.*` IPC calls — never import main-process modules in the renderer.

## Key Design Points

- **Rubric categories** are fixed: `accuracy`, `fluency`, `completeness`, `tone`. The scoring engine calls the AI once per category sequentially, not in parallel.
- **AI response parsing** (`parseAiResponse` in `src/main/ai/index.ts`) extracts a JSON block from the raw AI text via regex. The AI must return a `{ score, issues[] }` object.
- **Settings** store the AI provider (`claude` | `openai`), model name, and encrypted API key. The default model is `claude-sonnet-4-6`.
- **Path alias**: `@renderer` maps to `src/renderer/src/` (configured in `electron.vite.config.ts`).
- Unit tests live in `tests/unit/` and mirror the `src/main/` structure. E2E tests in `tests/e2e/` launch Electron via Playwright's `_electron` API.
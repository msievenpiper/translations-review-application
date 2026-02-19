# History Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store HTML snapshots and rubric weights per audit, add search/filter to the history list, and add a full detail view that replays any historical audit with the annotated webview.

**Architecture:** Two new columns (`html_snapshot`, `rubric_weights`) are added to the `audits` table via a column-existence migration guard. A new `audit:get` IPC returns a single full row; `audit:snapshot` writes the snapshot to a temp file and returns a `file://` path the existing `AnnotatedWebview` can load. The history list filters client-side. A new `HistoryDetailPage` mirrors `AuditPage` with read-only controls.

**Tech Stack:** better-sqlite3, React 19, React Router 7 (HashRouter), Electron IPC, Vitest (unit tests in `tests/unit/`), Tailwind CSS.

---

### Task 1: Schema migration — add `html_snapshot` and `rubric_weights` columns

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `tests/unit/db/schema.test.ts`

**Step 1: Write the failing tests**

Add to `tests/unit/db/schema.test.ts` after the existing tests:

```ts
it('audits table has html_snapshot column', () => {
  const cols = db.prepare("PRAGMA table_info(audits)").all() as { name: string }[]
  expect(cols.map(c => c.name)).toContain('html_snapshot')
})

it('audits table has rubric_weights column', () => {
  const cols = db.prepare("PRAGMA table_info(audits)").all() as { name: string }[]
  expect(cols.map(c => c.name)).toContain('rubric_weights')
})

it('html_snapshot defaults to empty string', () => {
  db.prepare(`
    INSERT INTO projects (id, name, source_locale, target_locales, rubric_config, custom_rules)
    VALUES ('p2', 'Snap Test', 'en', '["es"]', '{}', '')
  `).run()
  db.prepare(`
    INSERT INTO audits (id, project_id, input_type, input_ref)
    VALUES ('a1', 'p2', 'url', 'https://example.com')
  `).run()
  const row = db.prepare('SELECT html_snapshot, rubric_weights FROM audits WHERE id = ?').get('a1') as any
  expect(row.html_snapshot).toBe('')
  expect(row.rubric_weights).toBe('{}')
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/db/schema.test.ts
```

Expected: 3 new tests fail — columns not found.

**Step 3: Implement the migration**

Replace the body of `applySchema` in `src/main/db/schema.ts`:

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

  // Idempotent column migrations — safe to run on existing databases
  const auditCols = (db.prepare("PRAGMA table_info(audits)").all() as { name: string }[]).map(c => c.name)

  if (!auditCols.includes('html_snapshot')) {
    db.exec("ALTER TABLE audits ADD COLUMN html_snapshot TEXT NOT NULL DEFAULT ''")
  }
  if (!auditCols.includes('rubric_weights')) {
    db.exec("ALTER TABLE audits ADD COLUMN rubric_weights TEXT NOT NULL DEFAULT '{}'")
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/db/schema.test.ts
```

Expected: all 5 tests PASS.

**Step 5: Commit**

```bash
git add src/main/db/schema.ts tests/unit/db/schema.test.ts
git commit -m "feat: add html_snapshot and rubric_weights columns to audits table"
```

---

### Task 2: Capture snapshot and rubric weights in `audit:run`

**Files:**
- Modify: `src/main/ipc/audit.ts`
- Modify: `tests/unit/scoring/engine.test.ts` (no-op — confirm existing tests still pass)

**Step 1: Write a failing test**

Add to a new file `tests/unit/ipc/audit-snapshot.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../../../src/main/db/schema'

// Verify that the audits table persists rubric_weights and html_snapshot
describe('audits table snapshot columns', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    db.prepare(`
      INSERT INTO projects (id, name, source_locale, target_locales, rubric_config, custom_rules)
      VALUES ('p1', 'Test', 'en', '["es"]', '{"accuracy":{"weight":40},"fluency":{"weight":20},"completeness":{"weight":30},"tone":{"weight":10}}', '')
    `).run()
  })

  afterEach(() => db.close())

  it('stores html_snapshot and rubric_weights when inserted', () => {
    db.prepare(`
      INSERT INTO audits (id, project_id, input_type, input_ref, ai_results, final_score, html_snapshot, rubric_weights)
      VALUES ('a1', 'p1', 'url', 'https://example.com', '[]', 85, '<html>test</html>', '{"accuracy":{"weight":40}}')
    `).run()
    const row = db.prepare('SELECT html_snapshot, rubric_weights FROM audits WHERE id = ?').get('a1') as any
    expect(row.html_snapshot).toBe('<html>test</html>')
    expect(row.rubric_weights).toBe('{"accuracy":{"weight":40}}')
  })
})
```

**Step 2: Run test to verify it passes (schema already supports it)**

```bash
npx vitest run tests/unit/ipc/audit-snapshot.test.ts
```

Expected: PASS (confirms the schema change from Task 1 works end-to-end).

**Step 3: Update `audit:run` to save the snapshot and rubric weights**

In `src/main/ipc/audit.ts`, make these changes:

1. Add a `let htmlSnapshot = ''` variable alongside `targetText`/`sourceText`.
2. After `fetchPageHtml` for URL audits, capture `fetched.html`:
   ```ts
   const fetched = await fetchPageHtml(req.url)
   htmlSnapshot = fetched.html          // ← add this line
   const extracted = extractTextFromHtml(fetched.html)
   ```
3. For HTML file audits, capture the raw file:
   ```ts
   } else {
     const raw = readFileSync(req.filePath, 'utf-8')
     if (req.fileType === 'json') {
       // ... existing code
     } else if (req.fileType === 'csv') {
       // ... existing code
     } else {
       htmlSnapshot = raw               // ← add this line
       const extracted = extractTextFromHtml(raw)
       // ... rest unchanged
     }
   ```
4. Update the `INSERT INTO audits` statement to include the new columns:
   ```ts
   db.prepare(`
     INSERT INTO audits (id, project_id, input_type, input_ref, ai_results, final_score, html_snapshot, rubric_weights)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   `).run(
     auditId,
     project.id,
     req.type,
     inputRef,
     JSON.stringify(result.categoryResults),
     result.finalScore,
     htmlSnapshot,
     project.rubric_config,   // already a JSON string from the DB
   )
   ```

**Step 4: Verify existing unit tests still pass**

```bash
npx vitest run tests/unit/
```

Expected: all existing tests PASS.

**Step 5: Commit**

```bash
git add src/main/ipc/audit.ts tests/unit/ipc/audit-snapshot.test.ts
git commit -m "feat: capture html_snapshot and rubric_weights in audit:run"
```

---

### Task 3: Add `audit:get` and `audit:snapshot` IPC handlers

**Files:**
- Modify: `src/main/ipc/audit.ts`

**Step 1: Write the failing test**

Add to `tests/unit/ipc/audit-snapshot.test.ts`:

```ts
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

it('snapshot can be written to and read from a temp file', () => {
  const html = '<html><body>Hello world</body></html>'
  const tempPath = join(tmpdir(), 'test-audit-preview.html')
  writeFileSync(tempPath, html, 'utf-8')
  expect(existsSync(tempPath)).toBe(true)
  expect(readFileSync(tempPath, 'utf-8')).toBe(html)
})
```

**Step 2: Run test to verify it passes**

```bash
npx vitest run tests/unit/ipc/audit-snapshot.test.ts
```

Expected: PASS.

**Step 3: Add the two new handlers inside `registerAuditHandlers` in `src/main/ipc/audit.ts`**

Add after the `audit:delete` handler:

```ts
ipcMain.handle('audit:get', (_event, auditId: string) => {
  const row = getDb().prepare('SELECT * FROM audits WHERE id = ?').get(auditId)
  if (!row) throw new Error(`Audit not found: ${auditId}`)
  return row
})

ipcMain.handle('audit:snapshot', async (_event, auditId: string) => {
  const row = getDb().prepare('SELECT html_snapshot FROM audits WHERE id = ?').get(auditId) as any
  if (!row) throw new Error(`Audit not found: ${auditId}`)
  if (!row.html_snapshot) return null

  const { app } = await import('electron')
  const { join } = await import('path')
  const { writeFileSync } = await import('fs')

  const tempPath = join(app.getPath('temp'), 'audit-preview.html')
  writeFileSync(tempPath, row.html_snapshot, 'utf-8')
  return `file://${tempPath}`
})
```

Also update `audit:history` to exclude the large `html_snapshot` column from the list query (replace the existing handler body):

```ts
ipcMain.handle('audit:history', (_event, projectId: string) => {
  return getDb()
    .prepare(`
      SELECT id, project_id, input_type, input_ref, ai_results, final_score, rubric_weights, created_at
      FROM audits
      WHERE project_id = ?
      ORDER BY created_at DESC
    `)
    .all(projectId)
})
```

**Step 4: Run all unit tests**

```bash
npx vitest run tests/unit/
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add src/main/ipc/audit.ts tests/unit/ipc/audit-snapshot.test.ts
git commit -m "feat: add audit:get and audit:snapshot IPC handlers"
```

---

### Task 4: Expose new IPC in preload and type declarations

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/api.d.ts`

**Step 1: No test needed** (preload changes are integration-level; covered by the renderer using the types)

**Step 2: Update `src/preload/index.ts`**

Replace the `audit` block:

```ts
audit: {
  run:      (req: any)          => ipcRenderer.invoke('audit:run', req),
  get:      (auditId: string)   => ipcRenderer.invoke('audit:get', auditId),
  history:  (projectId: string) => ipcRenderer.invoke('audit:history', projectId),
  delete:   (auditId: string)   => ipcRenderer.invoke('audit:delete', auditId),
  snapshot: (auditId: string)   => ipcRenderer.invoke('audit:snapshot', auditId),
},
```

**Step 3: Update `src/renderer/src/types/api.d.ts`**

Replace the `audit` block:

```ts
audit: {
  run:      (req: any)          => Promise<any>
  get:      (auditId: string)   => Promise<any>
  history:  (projectId: string) => Promise<any[]>
  delete:   (auditId: string)   => Promise<void>
  snapshot: (auditId: string)   => Promise<string | null>
}
```

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/src/types/api.d.ts
git commit -m "feat: expose audit:get and audit:snapshot in preload bridge"
```

---

### Task 5: History list — search/filter + View button

**Files:**
- Modify: `src/renderer/src/pages/HistoryPage.tsx`

**Step 1: No unit test** (pure render/filter logic; covered by manual inspection)

**Step 2: Replace `src/renderer/src/pages/HistoryPage.tsx` with this implementation**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface AuditRecord {
  id:            string
  project_id:    string
  input_type:    'url' | 'file'
  input_ref:     string
  final_score:   number
  rubric_weights: string
  created_at:    number
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function formatDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function HistoryPage() {
  const navigate = useNavigate()
  const [audits, setAudits]   = useState<AuditRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Filter state
  const [search,   setSearch]   = useState('')
  const [minScore, setMinScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  useEffect(() => {
    window.api.audit.history('default')
      .then((data: any[]) => { setAudits(data); setLoading(false) })
      .catch((e: any)     => { setError(e?.message ?? 'Failed to load history'); setLoading(false) })
  }, [])

  function handleDelete(auditId: string) {
    window.api.audit.delete(auditId)
      .then(() => setAudits(prev => prev.filter(a => a.id !== auditId)))
      .catch((e: any) => alert(`Delete failed: ${e?.message ?? 'unknown error'}`))
  }

  const filtered = audits.filter(a => {
    if (search && !a.input_ref.toLowerCase().includes(search.toLowerCase())) return false
    if (minScore !== '' && (a.final_score ?? 0) < Number(minScore)) return false
    if (maxScore !== '' && (a.final_score ?? 0) > Number(maxScore)) return false
    if (fromDate) {
      const from = new Date(fromDate).getTime() / 1000
      if (a.created_at < from) return false
    }
    if (toDate) {
      const to = new Date(toDate).getTime() / 1000 + 86399 // end of day
      if (a.created_at > to) return false
    }
    return true
  })

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading history…</div>
  if (error)   return <div className="p-8"><p className="text-red-400 text-sm">{error}</p></div>

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Audit History</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search URL or file…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="number"
          placeholder="Min score"
          min={0} max={100}
          value={minScore}
          onChange={e => setMinScore(e.target.value)}
          className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="number"
          placeholder="Max score"
          min={0} max={100}
          value={maxScore}
          onChange={e => setMaxScore(e.target.value)}
          className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        />
        <input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl opacity-20 mb-3">📋</div>
          <p className="text-gray-500 text-sm">{audits.length === 0 ? 'No audits yet.' : 'No audits match the filters.'}</p>
          {audits.length === 0 && (
            <p className="text-gray-600 text-xs mt-1">Run your first audit from the Audit tab.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(audit => (
            <div
              key={audit.id}
              className="flex items-center gap-4 bg-gray-800 hover:bg-gray-750 rounded-lg p-4 group"
            >
              <div className={`text-2xl font-bold tabular-nums w-12 text-right shrink-0 ${scoreColor(Math.round(audit.final_score ?? 0))}`}>
                {Math.round(audit.final_score ?? 0)}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate" title={audit.input_ref}>
                  {audit.input_ref}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500 uppercase font-mono">{audit.input_type}</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-xs text-gray-500">{formatDate(audit.created_at)}</span>
                </div>
              </div>

              <button
                onClick={() => navigate(`/history/${audit.id}`)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors opacity-0 group-hover:opacity-100"
              >
                View
              </button>
              <button
                onClick={() => handleDelete(audit.id)}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete audit"
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

**Step 3: Run typecheck**

```bash
npm run typecheck:web
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/renderer/src/pages/HistoryPage.tsx
git commit -m "feat: add search/filter and View button to history list"
```

---

### Task 6: Create `HistoryDetailPage`

**Files:**
- Create: `src/renderer/src/pages/HistoryDetailPage.tsx`

**Step 1: No unit test** (Electron webview rendering is integration-level)

**Step 2: Create `src/renderer/src/pages/HistoryDetailPage.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnnotatedWebview } from '../components/audit/AnnotatedWebview'
import { CommentsPanel }    from '../components/audit/CommentsPanel'
import { ScorePanel }       from '../components/audit/ScorePanel'

interface AuditIssue {
  id:              number
  category:        string
  original_text:   string
  translated_text: string
  reason:          string
  suggestion:      string
  severity:        'low' | 'medium' | 'high'
  text:            string
}

function formatDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function HistoryDetailPage() {
  const { auditId }  = useParams<{ auditId: string }>()
  const navigate     = useNavigate()

  const [audit,       setAudit]       = useState<any>(null)
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [activeId,    setActiveId]    = useState<number | null>(null)

  useEffect(() => {
    if (!auditId) return
    Promise.all([
      window.api.audit.get(auditId),
      window.api.audit.snapshot(auditId),
    ])
      .then(([auditRow, snapUrl]) => {
        setAudit(auditRow)
        setSnapshotUrl(snapUrl)
        setLoading(false)
      })
      .catch((e: any) => {
        setError(e?.message ?? 'Failed to load audit')
        setLoading(false)
      })
  }, [auditId])

  const handleExport = useCallback(async () => {
    if (!auditId) return
    try {
      const filePath = await window.api.export.report(auditId)
      alert(`Report saved to:\n${filePath}`)
    } catch (e: any) {
      alert(`Export failed: ${e?.message ?? 'unknown error'}`)
    }
  }, [auditId])

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading audit…</div>
  if (error || !audit) return <div className="p-8"><p className="text-red-400 text-sm">{error ?? 'Audit not found'}</p></div>

  const categoryResults: any[] = (() => {
    try { return JSON.parse(audit.ai_results ?? '[]') } catch { return [] }
  })()

  const rubricWeights: Record<string, { weight: number }> = (() => {
    try { return JSON.parse(audit.rubric_weights ?? '{}') } catch { return {} }
  })()

  const weights = {
    accuracy:     rubricWeights.accuracy?.weight     ?? 40,
    fluency:      rubricWeights.fluency?.weight       ?? 20,
    completeness: rubricWeights.completeness?.weight  ?? 30,
    tone:         rubricWeights.tone?.weight          ?? 10,
  }

  const categoryScores: Record<string, number> = Object.fromEntries(
    categoryResults.map((r: any) => [r.category, r.score])
  )

  const issues: AuditIssue[] = categoryResults
    .flatMap((r: any) =>
      (r.issues ?? []).map((issue: any) => ({ ...issue, category: r.category }))
    )
    .map((issue: any, i: number) => ({
      ...issue,
      id:   i + 1,
      text: issue.original_text ?? issue.translated_text ?? '',
    }))

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0)
  const computedScore = totalWeight === 0 ? 0 : Math.round(
    Object.entries(categoryScores).reduce((sum, [cat, score]) => {
      return sum + score * (weights[cat as keyof typeof weights] ?? 0)
    }, 0) / totalWeight
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top strip */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 bg-gray-900">
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← History
        </button>
        <span className="text-gray-700">|</span>
        <p className="text-sm text-gray-200 font-medium truncate flex-1" title={audit.input_ref}>
          {audit.input_ref}
        </p>
        <span className="text-xs text-gray-500 shrink-0">{formatDate(audit.created_at)}</span>
      </div>

      {/* Score + rubric (read-only) */}
      <div className="shrink-0 border-b border-gray-800">
        <ScorePanel
          score={computedScore}
          weights={weights}
          categoryScores={categoryScores}
          onWeightChange={() => {}}
          customRules=""
          onCustomRules={() => {}}
          disabled={true}
        />
      </div>

      {/* Webview + comments */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          {snapshotUrl ? (
            <AnnotatedWebview
              url={snapshotUrl}
              issues={issues}
              onAnnotationClick={setActiveId}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-900 h-full">
              <div className="text-center">
                <div className="text-4xl mb-3 opacity-30">📄</div>
                <p className="text-gray-500 text-sm">No preview available for file audits</p>
              </div>
            </div>
          )}
        </div>
        <CommentsPanel
          issues={issues}
          activeId={activeId}
          onIssueClick={setActiveId}
          onExport={handleExport}
        />
      </div>
    </div>
  )
}
```

**Step 3: Run typecheck**

```bash
npm run typecheck:web
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/renderer/src/pages/HistoryDetailPage.tsx
git commit -m "feat: add HistoryDetailPage with annotated snapshot replay"
```

---

### Task 7: Wire up the new route

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Step 1: No unit test** (router wiring)

**Step 2: Add the import and route in `src/renderer/src/App.tsx`**

Add import after existing page imports:

```ts
import { HistoryDetailPage } from './pages/HistoryDetailPage'
```

Add route inside the `<Route path="/" element={<AppShell />}>` block, after the `history` route:

```tsx
<Route path="history/:auditId" element={<HistoryDetailPage />} />
```

The full Routes block should look like:

```tsx
<Routes>
  <Route path="/" element={<AppShell />}>
    <Route index element={<AuditPage />} />
    <Route path="history" element={<HistoryPage />} />
    <Route path="history/:auditId" element={<HistoryDetailPage />} />
    <Route path="settings" element={<SettingsPage />} />
  </Route>
</Routes>
```

**Step 3: Run full typecheck**

```bash
npm run typecheck
```

Expected: no errors.

**Step 4: Run all unit tests**

```bash
npm test
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: add /history/:auditId route for audit detail view"
```

---

### Task 8: Smoke test in development

**Step 1: Start the app**

```bash
npm run dev
```

**Step 2: Verify end-to-end**

1. Run a URL audit — confirm it completes normally.
2. Go to History — confirm the audit appears in the list.
3. Type part of the URL in the search box — confirm filtering works.
4. Adjust min/max score and date range — confirm filters combine correctly.
5. Click "View" on a URL audit — confirm the detail page opens with:
   - The correct URL shown in the top strip.
   - The score and rubric sliders visible (disabled).
   - The annotated webview loading the HTML snapshot with highlighted issues.
   - Clicking a highlight scrolls the CommentsPanel to that issue.
   - "Export Report" saves a file.
6. Click "← History" — confirm navigation back.
7. Run a JSON file audit, go to History, click View — confirm the "No preview available for file audits" placeholder appears (webview replaced by placeholder).

**Step 3: Commit if any minor fixes were needed** (otherwise no commit required)

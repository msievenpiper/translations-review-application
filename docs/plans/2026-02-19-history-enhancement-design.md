# History Enhancement Design

**Date:** 2026-02-19
**Status:** Approved

## Goal

Make the audit history more useful by:
1. Storing the full rendered HTML snapshot at audit time so the annotated preview can be replayed from history exactly as it appeared.
2. Snapshotting the rubric weights at audit time so scores are reproducible.
3. Adding search/filter to the history list (by URL/filename, date range, score range).
4. Adding a detail view for any historical audit that mirrors the live AuditPage layout.

## Approach

Store HTML snapshots and rubric weights as new columns in the existing `audits` SQLite table (Approach A). No new files on disk, no new abstractions. Client-side filtering over the already-fetched list.

## Data Layer

### Schema migration (`src/main/db/schema.ts`)

Two new columns added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guards (safe to run on existing DBs):

```sql
ALTER TABLE audits ADD COLUMN html_snapshot   TEXT NOT NULL DEFAULT '';
ALTER TABLE audits ADD COLUMN rubric_weights  TEXT NOT NULL DEFAULT '{}';
```

- `html_snapshot` — raw HTML string from the puppeteer fetch (URL audits) or raw file contents (HTML file audits). Empty string for JSON/CSV audits.
- `rubric_weights` — JSON snapshot of the project's `rubric_config` at audit time (e.g. `{"accuracy":{"weight":40},...}`).

### New IPC handler

- `audit:get(auditId)` — returns a single full audit row including `html_snapshot` and `rubric_weights`.
- `audit:snapshot(auditId)` — writes `html_snapshot` to `<app.getPath('temp')>/audit-preview.html` and returns the `file://` path for the webview. Overwrites the same temp file each time.

The `audit:history` response is unchanged structurally, but now includes `rubric_weights` so the list can show category breakdown without a second fetch.

## Audit Flow Changes (`src/main/ipc/audit.ts`)

When `audit:run` handles a URL audit:
- The HTML already fetched by `fetchPageHtml` is saved as `html_snapshot`.

When handling an HTML file audit:
- The raw file contents are saved as `html_snapshot`.

When handling JSON/CSV file audits:
- `html_snapshot` is saved as `''`.

The project's `rubric_config` is serialized and saved as `rubric_weights` in all cases.

No changes to the scoring engine or AI calls.

## History List (`src/renderer/src/pages/HistoryPage.tsx`)

Filter bar added at the top with three controls rendered inline:
- **Search** — text input, case-insensitive `includes()` match against `input_ref`.
- **Score range** — "Min" / "Max" number inputs (0–100).
- **Date range** — "From" / "To" date pickers (native `<input type="date">`).

All filtering is client-side. Each audit row gains a "View" button that navigates to `/history/:auditId`.

## History Detail View (`src/renderer/src/pages/HistoryDetailPage.tsx`)

Route: `/history/:auditId`

Layout mirrors `AuditPage`:

**Top strip:**
- Back button → `navigate(-1)`
- `input_ref` as title (truncated), date, Export button (calls `export:report`)

**Score + rubric panel (read-only):**
- `ScorePanel` rendered with `disabled={true}` using snapshotted weights and category scores from `ai_results`.
- Custom rules shown as read-only text (if stored; currently not captured — see note below).

**Bottom split:**
- Left: `AnnotatedWebview` loaded from the `file://` temp path returned by `audit:snapshot`.
  - For JSON/CSV audits (`html_snapshot === ''`): placeholder instead of webview.
- Right: `CommentsPanel` with issues from `ai_results`, Export button.

## Router Change (`src/renderer/src/App.tsx`)

Add route:
```tsx
<Route path="history/:auditId" element={<HistoryDetailPage />} />
```

## Preload (`src/preload/index.ts`)

Expose new handlers:
```ts
audit: {
  ...existing,
  get:      (auditId: string) => ipcRenderer.invoke('audit:get', auditId),
  snapshot: (auditId: string) => ipcRenderer.invoke('audit:snapshot', auditId),
}
```

And `src/renderer/src/types/api.d.ts` updated accordingly.

## Notes

- **Custom rules** are not currently saved per-audit (only per-project). This design does not add that — it is out of scope.
- **Snapshot size**: a typical rendered page is 50–500 KB. SQLite TEXT handles this fine. A future "purge snapshots" option can zero out `html_snapshot` for old audits if storage becomes a concern.
- **Temp file**: `audit-preview.html` is overwritten on each `audit:snapshot` call. Only one detail view is open at a time in Electron's single-window model, so this is safe.

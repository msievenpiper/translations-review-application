# URL User Agent & Browser Language Design

**Date:** 2026-02-19
**Branch:** feature/url-useragent-language
**Scope:** Per-audit only (no persistence)

## Problem

The URL extractor uses puppeteer's default Chromium user agent and no explicit `Accept-Language` header. Many websites serve different content based on UA (mobile vs desktop) or browser language headers rather than URL path alone. This makes it impossible to audit mobile-specific translations or language-negotiated pages.

## Solution

Add an optional "Advanced" collapsible section below the URL input in `AuditPanel`. It exposes two selects — Device (user agent) and Language (`Accept-Language` header) — plus conditional free-text inputs for custom values. Settings are per-audit only and reset to defaults on panel load.

## Data Model

`AuditRequest` gains two optional fields on the `url` variant:

```ts
| {
    type: 'url'
    projectId: string
    url: string
    userAgent?: string        // full UA string or undefined = puppeteer default
    acceptLanguage?: string   // Accept-Language value or undefined = no header
  }
```

`fetchPageHtml` gains a matching options param:

```ts
export async function fetchPageHtml(
  url: string,
  opts?: { userAgent?: string; acceptLanguage?: string }
): Promise<FetchResult>
```

When `userAgent` is provided, puppeteer calls `page.setUserAgent(userAgent)`. When `acceptLanguage` is provided, puppeteer calls `page.setExtraHTTPHeaders({ 'Accept-Language': acceptLanguage })`. The viewport also adjusts to match the platform preset.

## Device (User Agent) Presets

| Label | Viewport | User Agent |
|---|---|---|
| Desktop (default) | 1280×900 | puppeteer default |
| iPhone 15 | 390×844 | `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1` |
| iPad Pro | 1024×1366 | `Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1` |
| Android (Chrome) | 412×915 | `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36` |
| Custom… | 1280×900 | free-text input |

## Browser Language Presets

50 presets covering the top languages by global speaker/internet usage, plus "Browser default" (no header) and "Custom…" (free-text). Each preset value uses the format `{locale},{lang};q=0.9` (e.g. `es-ES,es;q=0.9`).

Full list: en-US, en-GB, zh-CN, zh-TW, es-ES, es-MX, ar-SA, hi-IN, bn-BD, pt-BR, pt-PT, ru-RU, ja-JP, de-DE, ko-KR, fr-FR, tr-TR, vi-VN, ta-IN, it-IT, ur-PK, th-TH, fa-IR, pl-PL, id-ID, ms-MY, pa-IN, nl-NL, uk-UA, sv-SE, nb-NO, da-DK, fi-FI, cs-CZ, hu-HU, ro-RO, el-GR, he-IL, bg-BG, hr-HR, sk-SK, ca-ES, fil-PH, sw-KE, sr-RS, lt-LT, lv-LV, sl-SI, et-EE, af-ZA.

## UI Layout

```
┌─────────────────────────────────────────────┐
│ https://example.com/es/                      │
└─────────────────────────────────────────────┘
  Advanced ▸                    ← toggle, defaults collapsed

  (expanded)
  Advanced ▾
  ┌─────────────────────┐  ┌─────────────────────┐
  │ Device: iPhone 15 ▾ │  │ Language: es-ES ▾   │
  └─────────────────────┘  └─────────────────────┘

  (if Custom UA selected)
  ┌─────────────────────────────────────────────┐
  │ Mozilla/5.0 (custom UA string…)              │
  └─────────────────────────────────────────────┘

  (if Custom language selected)
  ┌─────────────────────────────────────────────┐
  │ fr-CH,fr;q=0.9                               │
  └─────────────────────────────────────────────┘
```

- `isAdvancedOpen` is local React state, defaults to `false`
- Both selects sit side-by-side in one row
- Custom inputs appear below only when "Custom…" is selected
- No validation on custom UA (passed verbatim)
- Custom language input: trim whitespace only

## Files Changed

| File | Change |
|---|---|
| `src/main/extractor/url.ts` | Add `opts` param; apply UA, Accept-Language header, viewport |
| `src/main/ipc/types.ts` | Add `userAgent?` and `acceptLanguage?` to url variant |
| `src/main/ipc/audit.ts` | Pass fields through to `fetchPageHtml` |
| `src/renderer/src/components/audit/AuditPanel.tsx` | Add Advanced section with presets and custom inputs |
| `src/renderer/src/types/api.d.ts` | Sync AuditRequest type |
| `tests/unit/extractor/url.test.ts` | Test new opts (mock puppeteer) |

## Out of Scope

- Persisting UA/language preferences (per-project or global)
- Viewport override independent of UA preset
- Cookie or localStorage injection

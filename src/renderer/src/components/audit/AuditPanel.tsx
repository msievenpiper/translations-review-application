import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorInfo } from '../../utils/errorMessages'

type InputMode = 'url' | 'file'
type FileType  = 'html' | 'json' | 'csv'

interface UaPreset {
  label:     string
  userAgent: string | undefined
}

interface LangPreset {
  label:          string
  acceptLanguage: string | undefined
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
  { label: 'Browser default',             acceptLanguage: undefined },
  { label: 'English (en-US)',             acceptLanguage: 'en-US,en;q=0.9' },
  { label: 'English (en-GB)',             acceptLanguage: 'en-GB,en;q=0.9' },
  { label: 'Chinese Simplified (zh-CN)',  acceptLanguage: 'zh-CN,zh;q=0.9' },
  { label: 'Chinese Traditional (zh-TW)', acceptLanguage: 'zh-TW,zh;q=0.9' },
  { label: 'Spanish (es-ES)',             acceptLanguage: 'es-ES,es;q=0.9' },
  { label: 'Spanish (es-MX)',             acceptLanguage: 'es-MX,es;q=0.9' },
  { label: 'Arabic (ar-SA)',              acceptLanguage: 'ar-SA,ar;q=0.9' },
  { label: 'Hindi (hi-IN)',               acceptLanguage: 'hi-IN,hi;q=0.9' },
  { label: 'Bengali (bn-BD)',             acceptLanguage: 'bn-BD,bn;q=0.9' },
  { label: 'Portuguese (pt-BR)',          acceptLanguage: 'pt-BR,pt;q=0.9' },
  { label: 'Portuguese (pt-PT)',          acceptLanguage: 'pt-PT,pt;q=0.9' },
  { label: 'Russian (ru-RU)',             acceptLanguage: 'ru-RU,ru;q=0.9' },
  { label: 'Japanese (ja-JP)',            acceptLanguage: 'ja-JP,ja;q=0.9' },
  { label: 'German (de-DE)',              acceptLanguage: 'de-DE,de;q=0.9' },
  { label: 'Korean (ko-KR)',              acceptLanguage: 'ko-KR,ko;q=0.9' },
  { label: 'French (fr-FR)',              acceptLanguage: 'fr-FR,fr;q=0.9' },
  { label: 'Turkish (tr-TR)',             acceptLanguage: 'tr-TR,tr;q=0.9' },
  { label: 'Vietnamese (vi-VN)',          acceptLanguage: 'vi-VN,vi;q=0.9' },
  { label: 'Tamil (ta-IN)',               acceptLanguage: 'ta-IN,ta;q=0.9' },
  { label: 'Italian (it-IT)',             acceptLanguage: 'it-IT,it;q=0.9' },
  { label: 'Urdu (ur-PK)',                acceptLanguage: 'ur-PK,ur;q=0.9' },
  { label: 'Thai (th-TH)',                acceptLanguage: 'th-TH,th;q=0.9' },
  { label: 'Persian (fa-IR)',             acceptLanguage: 'fa-IR,fa;q=0.9' },
  { label: 'Polish (pl-PL)',              acceptLanguage: 'pl-PL,pl;q=0.9' },
  { label: 'Indonesian (id-ID)',          acceptLanguage: 'id-ID,id;q=0.9' },
  { label: 'Malay (ms-MY)',               acceptLanguage: 'ms-MY,ms;q=0.9' },
  { label: 'Punjabi (pa-IN)',             acceptLanguage: 'pa-IN,pa;q=0.9' },
  { label: 'Dutch (nl-NL)',               acceptLanguage: 'nl-NL,nl;q=0.9' },
  { label: 'Ukrainian (uk-UA)',           acceptLanguage: 'uk-UA,uk;q=0.9' },
  { label: 'Swedish (sv-SE)',             acceptLanguage: 'sv-SE,sv;q=0.9' },
  { label: 'Norwegian (nb-NO)',           acceptLanguage: 'nb-NO,nb;q=0.9' },
  { label: 'Danish (da-DK)',              acceptLanguage: 'da-DK,da;q=0.9' },
  { label: 'Finnish (fi-FI)',             acceptLanguage: 'fi-FI,fi;q=0.9' },
  { label: 'Czech (cs-CZ)',               acceptLanguage: 'cs-CZ,cs;q=0.9' },
  { label: 'Hungarian (hu-HU)',           acceptLanguage: 'hu-HU,hu;q=0.9' },
  { label: 'Romanian (ro-RO)',            acceptLanguage: 'ro-RO,ro;q=0.9' },
  { label: 'Greek (el-GR)',               acceptLanguage: 'el-GR,el;q=0.9' },
  { label: 'Hebrew (he-IL)',              acceptLanguage: 'he-IL,he;q=0.9' },
  { label: 'Bulgarian (bg-BG)',           acceptLanguage: 'bg-BG,bg;q=0.9' },
  { label: 'Croatian (hr-HR)',            acceptLanguage: 'hr-HR,hr;q=0.9' },
  { label: 'Slovak (sk-SK)',              acceptLanguage: 'sk-SK,sk;q=0.9' },
  { label: 'Catalan (ca-ES)',             acceptLanguage: 'ca-ES,ca;q=0.9' },
  { label: 'Filipino (fil-PH)',           acceptLanguage: 'fil-PH,fil;q=0.9' },
  { label: 'Swahili (sw-KE)',             acceptLanguage: 'sw-KE,sw;q=0.9' },
  { label: 'Serbian (sr-RS)',             acceptLanguage: 'sr-RS,sr;q=0.9' },
  { label: 'Lithuanian (lt-LT)',          acceptLanguage: 'lt-LT,lt;q=0.9' },
  { label: 'Latvian (lv-LV)',             acceptLanguage: 'lv-LV,lv;q=0.9' },
  { label: 'Slovenian (sl-SI)',           acceptLanguage: 'sl-SI,sl;q=0.9' },
  { label: 'Estonian (et-EE)',            acceptLanguage: 'et-EE,et;q=0.9' },
  { label: 'Afrikaans (af-ZA)',           acceptLanguage: 'af-ZA,af;q=0.9' },
  { label: 'Custom…',                     acceptLanguage: 'custom' },
]

interface Props {
  projectId:    string
  onResult:     (result: any) => void
  onProgress:   (step: string) => void
  onAuditedUrl: (url: string | null) => void
}

export function AuditPanel({ projectId, onResult, onProgress, onAuditedUrl }: Props) {
  const [mode, setMode]         = useState<InputMode>('url')
  const [url, setUrl]           = useState('')
  const [filePath, setFilePath] = useState('')
  const [fileType, setFileType] = useState<FileType>('json')
  const [running, setRunning]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const [isAdvancedOpen, setIsAdvancedOpen]     = useState(false)
  const [uaPresetIndex, setUaPresetIndex]       = useState(0)
  const [customUa, setCustomUa]                 = useState('')
  const [langPresetIndex, setLangPresetIndex]   = useState(0)
  const [customLang, setCustomLang]             = useState('')

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

              {isCustomUa && (
                <input
                  type="text"
                  value={customUa}
                  onChange={e => setCustomUa(e.target.value)}
                  placeholder="Mozilla/5.0 (custom user agent…)"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                />
              )}

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

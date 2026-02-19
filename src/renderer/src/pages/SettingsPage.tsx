import { type JSX, useState, useEffect } from 'react'

interface ProviderConfig {
  id: string
  label: string
  models: string[]
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'claude',
    label: 'Anthropic Claude',
    models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
  }
]

export function SettingsPage(): JSX.Element {
  const [provider, setProvider] = useState<'claude' | 'openai'>('claude')
  const [model, setModel] = useState<string>('claude-sonnet-4-6')
  const [apiKey, setApiKey] = useState<string>('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.settings
      .load()
      .then((s) => {
        if (s.provider) setProvider(s.provider)
        if (s.model) setModel(s.model)
        if (s.apiKey) setApiKey(s.apiKey)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function handleProviderChange(newProvider: string): void {
    setProvider(newProvider as 'claude' | 'openai')
    const config = PROVIDERS.find((p) => p.id === newProvider)
    if (config) setModel(config.models[0])
  }

  async function handleSave(): Promise<void> {
    await window.api.settings.save({ provider, model, apiKey })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const models = PROVIDERS.find((p) => p.id === provider)?.models ?? []

  if (loading) {
    return <div className="p-8 text-gray-400 text-sm">Loading settings…</div>
  }

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* AI Provider */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">AI Provider</label>
          <div className="flex gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={`flex-1 py-2 px-3 rounded text-sm font-medium border transition-colors ${
                  provider === p.id
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`Enter your ${PROVIDERS.find((p) => p.id === provider)?.label ?? ''} API key`}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-gray-100 focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1.5">
            Stored securely using OS-level encryption via Electron&apos;s safeStorage API.
          </p>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!apiKey}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded text-sm font-medium transition-colors"
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

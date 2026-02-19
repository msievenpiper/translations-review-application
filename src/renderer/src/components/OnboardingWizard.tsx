import { useState } from 'react'

const PROVIDERS = [
  { id: 'claude', label: 'Claude', defaultModel: 'claude-sonnet-4-6', docsUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o', docsUrl: 'https://platform.openai.com/api-keys' },
]

interface Props {
  onComplete: () => void
}

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep]         = useState<1 | 2 | 3>(1)
  const [provider, setProvider] = useState('claude')
  const [apiKey, setApiKey]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const selectedProvider = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0]

  function handleProviderChange(id: string) {
    setProvider(id)
    setError(null)
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      setError('Please enter an API key to continue.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.api.settings.save({
        provider,
        model: selectedProvider.defaultModel,
        apiKey: apiKey.trim(),
      })
      setStep(3)
      setTimeout(() => onComplete(), 1500)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 w-full max-w-md shadow-2xl">

        {/* Step 1 – Welcome */}
        {step === 1 && (
          <div className="text-center space-y-4">
            <div className="text-4xl mb-2">🌐</div>
            <h1 className="text-2xl font-semibold text-gray-100">Translation Auditor</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              AI-powered review of translated web pages. Let's get you set up in just a moment.
            </p>
            <button
              onClick={() => setStep(2)}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Get Started →
            </button>
          </div>
        )}

        {/* Step 2 – Provider + API Key */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Configure your AI provider</h2>
              <p className="text-gray-500 text-xs mt-1">You can change this later in Settings.</p>
            </div>

            {/* Provider toggle */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">AI Provider</label>
              <div className="flex gap-2">
                {PROVIDERS.map(p => (
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

            {/* API Key input */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setError(null) }}
                onKeyDown={e => e.key === 'Enter' && !saving && handleSave()}
                placeholder={provider === 'claude' ? 'sk-ant-…' : 'sk-…'}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-gray-100 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Get your key at{' '}
                <span className="text-blue-400">{selectedProvider.docsUrl}</span>
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving…' : 'Save & Launch →'}
            </button>
          </div>
        )}

        {/* Step 3 – Confirmation */}
        {step === 3 && (
          <div className="text-center space-y-3">
            <div className="text-4xl">✓</div>
            <h2 className="text-lg font-semibold text-gray-100">You're all set!</h2>
            <p className="text-gray-400 text-sm">Launching the app…</p>
          </div>
        )}
      </div>
    </div>
  )
}

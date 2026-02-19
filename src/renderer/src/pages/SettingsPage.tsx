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

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatNextRun(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function AiSettingsTab(): JSX.Element {
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
    return <div className="text-gray-400 text-sm">Loading settings…</div>
  }

  return (
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
  )
}

function SchedulesTab(): JSX.Element {
  const [trackedUrls, setTrackedUrls] = useState<TrackedUrlDbRow[]>([])
  const [schedule, setSchedule] = useState<ScheduleDbRow | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [dayOfWeek, setDayOfWeek] = useState<number>(1)
  const [dayOfMonth, setDayOfMonth] = useState<number>(1)
  const [timeOfDay, setTimeOfDay] = useState('09:00')
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState('')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    Promise.all([
      window.api.schedule.trackedUrls.list('default'),
      window.api.schedule.get('default')
    ])
      .then(([urls, sched]) => {
        setTrackedUrls(urls)
        if (sched) {
          setSchedule(sched)
          setFrequency(sched.frequency)
          setDayOfWeek(sched.day_of_week ?? 1)
          setDayOfMonth(sched.day_of_month ?? 1)
          setTimeOfDay(sched.time_of_day)
          setEnabled(sched.enabled === 1)
        }
      })
      .catch(() => {})
  }, [])

  async function handleAddUrl(): Promise<void> {
    const trimmed = newUrl.trim()
    if (!trimmed) return
    try {
      const added = await window.api.schedule.trackedUrls.add('default', trimmed)
      setTrackedUrls((prev) => [...prev, added])
      setNewUrl('')
    } catch (e) {
      alert(`Failed to add URL: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  async function handleToggleUrl(urlId: string, currentEnabled: number): Promise<void> {
    const next = currentEnabled !== 1
    await window.api.schedule.trackedUrls.toggle(urlId, next)
    setTrackedUrls((prev) =>
      prev.map((u) => (u.id === urlId ? { ...u, enabled: next ? 1 : 0 } : u))
    )
  }

  async function handleDeleteUrl(urlId: string): Promise<void> {
    await window.api.schedule.trackedUrls.delete(urlId)
    setTrackedUrls((prev) => prev.filter((u) => u.id !== urlId))
  }

  async function handleSaveSchedule(): Promise<void> {
    setSaving(true)
    try {
      const saved = await window.api.schedule.upsert('default', {
        enabled: enabled ? 1 : 0,
        frequency,
        day_of_week: frequency === 'weekly' ? dayOfWeek : null,
        day_of_month: frequency === 'monthly' ? dayOfMonth : null,
        time_of_day: timeOfDay
      })
      setSchedule(saved)
      setSaveFeedback('✓ Saved')
      setTimeout(() => setSaveFeedback(''), 2000)
    } catch (e) {
      alert(`Failed to save schedule: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleRunNow(): Promise<void> {
    setRunning(true)
    try {
      await window.api.schedule.runNow('default')
    } catch (e) {
      alert(`Run failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Tracked URLs */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">Tracked URLs</h2>
        <div className="space-y-2 mb-3">
          {trackedUrls.length === 0 && (
            <p className="text-xs text-gray-500">No tracked URLs yet. Add one below.</p>
          )}
          {trackedUrls.map((u) => (
            <div key={u.id} className="flex items-center gap-3 bg-gray-800 rounded px-3 py-2">
              <span
                className={`text-sm font-mono truncate flex-1 ${u.enabled ? 'text-gray-200' : 'text-gray-500 line-through'}`}
                title={u.url}
              >
                {u.url}
              </span>
              <button
                onClick={() => handleToggleUrl(u.id, u.enabled)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  u.enabled
                    ? 'border-green-700 text-green-400 hover:border-green-600'
                    : 'border-gray-700 text-gray-500 hover:border-gray-600'
                }`}
              >
                {u.enabled ? 'Active' : 'Paused'}
              </button>
              <button
                onClick={() => handleDeleteUrl(u.id)}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            placeholder="https://example.com/page"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAddUrl}
            disabled={!newUrl.trim()}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 px-3 py-1.5 rounded text-sm transition-colors"
          >
            Add URL
          </button>
        </div>
      </div>

      {/* Schedule config */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">Schedule</h2>
        <div className="space-y-4">
          {/* Frequency */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Frequency</label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`flex-1 py-1.5 px-2 rounded text-sm border transition-colors capitalize ${
                    frequency === f
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Day selector — conditional */}
          {frequency === 'weekly' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Day of week</label>
              <div className="flex gap-1">
                {DAYS_OF_WEEK.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setDayOfWeek(i)}
                    className={`flex-1 py-1 rounded text-xs border transition-colors ${
                      dayOfWeek === i
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {frequency === 'monthly' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Day of month</label>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value))))}
                className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {/* Time */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Time (24h)</label>
            <input
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`}
              />
            </button>
            <span className="text-sm text-gray-300">{enabled ? 'Enabled' : 'Paused'}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSchedule}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
            >
              {saveFeedback || 'Save Schedule'}
            </button>
            <button
              onClick={handleRunNow}
              disabled={running || trackedUrls.filter((u) => u.enabled).length === 0}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 px-4 py-1.5 rounded text-sm transition-colors"
            >
              {running ? 'Running…' : 'Run Now'}
            </button>
          </div>

          {/* Next run */}
          {schedule && schedule.enabled === 1 && (
            <p className="text-xs text-gray-500">Next run: {formatNextRun(schedule.next_run_at)}</p>
          )}
        </div>
      </div>
    </div>
  )
}

type Tab = 'ai' | 'schedules'

export function SettingsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('ai')

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {(
          [
            ['ai', 'AI Settings'],
            ['schedules', 'Schedules']
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2 ${
              tab === id
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'ai' && <AiSettingsTab />}
      {tab === 'schedules' && <SchedulesTab />}
    </div>
  )
}

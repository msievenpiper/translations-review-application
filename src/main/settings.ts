import Store from 'electron-store'
import { safeStorage } from 'electron'

export interface RubricConfig {
  accuracy: { weight: number }
  fluency: { weight: number }
  completeness: { weight: number }
  tone: { weight: number }
}

export interface AppSettings {
  provider: 'claude' | 'openai'
  model: string
  apiKey: string
  defaultRubric: RubricConfig
}

export const DEFAULT_RUBRIC: RubricConfig = {
  accuracy: { weight: 40 },
  fluency: { weight: 20 },
  completeness: { weight: 30 },
  tone: { weight: 10 }
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
  if (settings.provider !== undefined) store.set('provider', settings.provider)
  if (settings.model !== undefined) store.set('model', settings.model)
  if (settings.defaultRubric !== undefined) store.set('defaultRubric', settings.defaultRubric)
}

export function loadSettings(): AppSettings {
  const raw = store.get('apiKeyEncrypted', '') as string
  const isEncrypted = store.get('apiKeyIsEncrypted', false) as boolean
  const apiKey =
    raw && isEncrypted ? safeStorage.decryptString(Buffer.from(raw, 'base64')) : (raw as string)

  return {
    provider: store.get('provider', 'claude') as AppSettings['provider'],
    model: store.get('model', 'claude-sonnet-4-6') as string,
    apiKey,
    defaultRubric: store.get('defaultRubric', DEFAULT_RUBRIC) as RubricConfig
  }
}

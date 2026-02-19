import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron before importing settings
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-app' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

// electron-store v8 is CJS - mock the constructor
vi.mock('electron-store', () => {
  const store = new Map<string, unknown>()
  return {
    default: class {
      get(key: string, def?: unknown) { return store.has(key) ? store.get(key) : def }
      set(key: string, val: unknown) { store.set(key, val) }
      delete(key: string) { store.delete(key) }
    },
  }
})

import { saveSettings, loadSettings, DEFAULT_RUBRIC } from '../../src/main/settings'

describe('settings', () => {
  it('round-trips provider and model', () => {
    saveSettings({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' })
    const loaded = loadSettings()
    expect(loaded.provider).toBe('openai')
    expect(loaded.model).toBe('gpt-4o')
  })

  it('returns default rubric when none saved', () => {
    const loaded = loadSettings()
    expect(loaded.defaultRubric.accuracy.weight).toBe(40)
  })

  it('stores and retrieves API key', () => {
    saveSettings({ apiKey: 'sk-abc123' })
    const loaded = loadSettings()
    expect(loaded.apiKey).toBe('sk-abc123')
  })
})

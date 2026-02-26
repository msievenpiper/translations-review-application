export interface TranslationPair {
  key: string
  value: string
}

function flatten(obj: unknown, prefix = ''): TranslationPair[] {
  const pairs: TranslationPair[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      pairs.push(...flatten(v, fullKey))
    } else if (typeof v === 'string') {
      pairs.push({ key: fullKey, value: v })
    }
  }
  return pairs
}

export function parseJsonTranslations(jsonString: string): TranslationPair[] {
  const parsed = JSON.parse(jsonString) // throws on invalid
  return flatten(parsed)
}

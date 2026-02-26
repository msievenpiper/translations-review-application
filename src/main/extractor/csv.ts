import Papa from 'papaparse'
import type { TranslationPair } from './json'

export function parseCsvTranslations(csvString: string): TranslationPair[] {
  const result = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    skipEmptyLines: true
  })

  const fields = result.meta.fields ?? []
  if (!fields.includes('value')) {
    throw new Error('CSV must have a value column. Found: ' + fields.join(', '))
  }

  const keyField = fields.includes('key') ? 'key' : fields[0]

  return result.data.map((row) => ({
    key: row[keyField] ?? '',
    value: row['value'] ?? ''
  }))
}

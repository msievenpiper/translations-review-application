export interface ErrorInfo {
  message: string
  goToSettings?: boolean
}

export function getErrorInfo(raw: string | undefined | null): ErrorInfo {
  if (!raw) return { message: 'An unknown error occurred.' }

  const lower = raw.toLowerCase()

  if (
    lower.includes('apikey') ||
    lower.includes('authtoken') ||
    lower.includes('authentication') ||
    lower.includes('api key')
  ) {
    return {
      message: 'Your API key is missing or invalid.',
      goToSettings: true
    }
  }

  if (lower.includes('rate limit')) {
    return { message: 'API rate limit reached. Wait a moment and try again.' }
  }

  if (
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('network') ||
    lower.includes('fetch')
  ) {
    return { message: 'Network error. Check your internet connection.' }
  }

  if (lower.includes('http 4') || lower.includes('http 5')) {
    return { message: "Could not load the URL. Make sure it's publicly accessible." }
  }

  return { message: raw }
}

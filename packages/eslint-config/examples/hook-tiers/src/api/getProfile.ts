export async function getProfile(signal: AbortSignal): Promise<string> {
  const response = await fetch('/api/profile', { signal })
  const body: unknown = await response.json()
  return typeof body === 'string' ? body : ''
}

export async function getOrders(signal: AbortSignal): Promise<string[]> {
  const response = await fetch('/api/orders', { signal })
  const body: unknown = await response.json()
  return Array.isArray(body) ? body.filter((item): item is string => typeof item === 'string') : []
}

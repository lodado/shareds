export async function getCart(signal: AbortSignal): Promise<number> {
  const response = await fetch('/api/cart', { signal })
  const body: unknown = await response.json()
  return typeof body === 'number' ? body : 0
}

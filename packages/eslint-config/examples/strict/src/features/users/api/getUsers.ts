export async function getUsers(): Promise<number> {
  const response = await fetch('/users/count')
  if (!response.ok) throw new Error(`Users request failed: ${response.status}`)
  const value: unknown = await response.json()
  if (typeof value !== 'number') throw new TypeError('Invalid user count')
  return value
}

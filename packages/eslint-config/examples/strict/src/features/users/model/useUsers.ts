import { useState } from 'react'
import { getUsers } from '../api/getUsers'

export function useUsers(): { count: number; refresh: () => Promise<void> } {
  const [count, setCount] = useState(0)
  async function refresh(): Promise<void> { setCount(await getUsers()) }
  return { count, refresh }
}

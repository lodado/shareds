import { useState } from 'react'
import { getCart } from '../api/getCart'

export function useFlatCart(): { total: number, reload: () => Promise<void> } {
  const [total, setTotal] = useState(0)
  async function reload(): Promise<void> {
    setTotal(await getCart(new AbortController().signal))
  }
  return { total, reload }
}

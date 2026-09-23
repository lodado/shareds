import { useQuery } from '@tanstack/react-query'
import { getCart } from '../../../api/getCart'

export function useCartTotal(): { total: number, reload: () => Promise<void> } {
  const query = useQuery({ queryKey: ['cart'], queryFn: ({ signal }) => getCart(signal) })
  return { total: query.data ?? 0, reload: async () => { await query.refetch() } }
}

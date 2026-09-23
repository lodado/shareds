import type { UseQueryResult } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { getOrders } from '../../../api/getOrders'

export function useOrderList(): UseQueryResult<string[]> {
  return useQuery({ queryKey: ['orders'], queryFn: ({ signal }) => getOrders(signal) })
}

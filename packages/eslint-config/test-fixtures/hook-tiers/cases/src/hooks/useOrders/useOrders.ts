import type { UseQueryResult } from '@tanstack/react-query'
import { useState } from 'react'
import { useOrderList } from './useOrderList/useOrderList'

export interface Orders { list: UseQueryResult<string[]>, page: number, next: () => void }

export function useOrders(): Orders {
  const list = useOrderList()
  const [page, setPage] = useState(1)
  return { list, page, next: () => { setPage(page + 1) } }
}

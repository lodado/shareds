import { useQuery } from '@tanstack/react-query'
import React, { useEffect } from 'react'
import { getCart } from '../../api/getCart'
import { useCouponCode } from '../useCheckout/useCouponCode/useCouponCode'
import { useLeak } from './useLeak/useLeak'

export { useLeak }

export function useBad(): string {
  const { useLayoutEffect } = React
  const query = useQuery({ queryKey: ['bad'], queryFn: ({ signal }) => getCart(signal) })
  const { code } = useCouponCode()
  useEffect(() => undefined, [])
  React.useInsertionEffect(() => undefined)
  useLayoutEffect(() => undefined)
  return `${code}${useLeak()}${String(query.data)}`
}

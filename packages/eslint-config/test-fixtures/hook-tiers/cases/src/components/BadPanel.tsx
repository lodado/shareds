import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getCart } from '../api/getCart'
import { useCouponCode } from '../hooks/useCheckout/useCouponCode/useCouponCode'

export function BadPanel(): React.ReactNode {
  const query = useQuery({ queryKey: ['cart'], queryFn: ({ signal }) => getCart(signal) })
  const { code } = useCouponCode()
  useEffect(() => { document.title = code }, [code])
  return <output>{query.data}</output>
}

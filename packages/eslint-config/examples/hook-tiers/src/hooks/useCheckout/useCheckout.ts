import { useMemo } from 'react'
import { totalAfterCoupon } from './checkout.pure'
import { useCartTotal } from './useCartTotal/useCartTotal'
import { useCouponCode } from './useCouponCode/useCouponCode'

export interface Checkout { total: number, code: string, apply: (next: string) => void, reload: () => Promise<void> }

export function useCheckout(): Checkout {
  const cart = useCartTotal()
  const coupon = useCouponCode()
  const total = useMemo(() => totalAfterCoupon(cart.total, coupon.code), [cart.total, coupon.code])
  return { total, code: coupon.code, apply: coupon.apply, reload: cart.reload }
}

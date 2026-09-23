import { useCouponCode } from '../model/useCheckout/useCouponCode/useCouponCode'

export function CouponBadge(): React.ReactNode {
  const { code } = useCouponCode()
  return <output>{code}</output>
}

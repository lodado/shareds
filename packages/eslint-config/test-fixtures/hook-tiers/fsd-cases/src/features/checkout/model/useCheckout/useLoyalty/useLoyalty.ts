import { useCouponCode } from '../useCouponCode/useCouponCode'

export function useLoyalty(): boolean {
  const { code } = useCouponCode()
  return code.length > 0
}

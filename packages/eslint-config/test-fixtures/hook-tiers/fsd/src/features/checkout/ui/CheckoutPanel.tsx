import { useCheckout } from '../model/useCheckout'

export function CheckoutPanel(): React.ReactNode {
  const { total, code, apply } = useCheckout()
  return (
    <section>
      <output>{total}</output>
      <input aria-label="coupon" value={code} onChange={(event) => { apply(event.target.value) }} />
    </section>
  )
}

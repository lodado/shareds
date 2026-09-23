import { useState } from 'react'
import { useCheckout } from '../hooks/useCheckout'

export function CheckoutPanel(): React.ReactNode {
  const { total, code, apply } = useCheckout()
  const [open, setOpen] = useState(false)
  return (
    <section>
      <output>{total}</output>
      <button type="button" onClick={() => { setOpen(!open) }}>coupon</button>
      {open && <input aria-label="coupon" value={code} onChange={(event) => { apply(event.target.value) }} />}
    </section>
  )
}

import { getCart } from '../api/getCart'

export function BadApi(): React.ReactNode {
  return <output>{String(getCart.length)}</output>
}

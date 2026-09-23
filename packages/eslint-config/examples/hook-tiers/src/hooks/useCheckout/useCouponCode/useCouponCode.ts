import { useState } from 'react'

export function useCouponCode(): { code: string, apply: (next: string) => void } {
  const [code, setCode] = useState('')
  return { code, apply: setCode }
}

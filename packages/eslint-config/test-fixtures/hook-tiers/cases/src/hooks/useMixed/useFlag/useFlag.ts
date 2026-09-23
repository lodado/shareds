import { useState } from 'react'

export function useFlag(): { on: boolean, toggle: () => void } {
  const [on, setOn] = useState(false)
  return { on, toggle: () => { setOn(!on) } }
}

/**
 * contracts/button.json — toggle button.
 * roles: button + aria-pressed bound to state (a literal "true" would never change).
 * css: pressed state uses colour and underline, so colour alone does not carry it.
 */
import { useState } from 'react'

export default function BoldToggle() {
  const [pressed, setPressed] = useState(false)

  return (
    <button type="button" className="control" aria-pressed={pressed} onClick={() => setPressed((value) => !value)}>
      굵게
    </button>
  )
}

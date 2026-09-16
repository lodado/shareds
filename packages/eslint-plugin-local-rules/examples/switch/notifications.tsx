/**
 * contracts/switch.json.
 * roles: button role="switch" aria-checked bound to state, labelled by the visible text.
 * keys: Space/Enter toggle — free from <button>.
 * css: thumb moves by transform; on/off are told apart by position, not only colour.
 */
import { useId, useState } from 'react'

export default function NotificationSwitch() {
  const [on, setOn] = useState(false)
  const labelId = useId()

  return (
    <span className="switch-label">
      <span id={labelId}>알림</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        className="switch"
        onClick={() => setOn((value) => !value)}
      >
        <span className="thumb" aria-hidden="true" />
      </button>
    </span>
  )
}

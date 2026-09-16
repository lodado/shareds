/**
 * contracts/disclosure.json.
 * roles: button + aria-expanded + aria-controls; the content has the id and no role.
 * focus: stays on the trigger.
 * keys: Enter/Space toggle — free from <button>.
 * css: the chevron rotates. The content uses `hidden` so collapsed text leaves the accessibility tree,
 *      which also means it cannot transition — animating height needs transition-behavior: allow-discrete.
 */
import { useId, useState } from 'react'

export default function ShippingFaq() {
  const [open, setOpen] = useState(false)
  const contentId = useId()

  return (
    <div>
      <button
        type="button"
        className="control disclosure-trigger"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        배송은 얼마나 걸리나요?
        <span className="chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      <div id={contentId} className="disclosure-content" hidden={!open}>
        영업일 기준 2–3일입니다. 도서 지역은 하루 더 걸릴 수 있습니다.
      </div>
    </div>
  )
}

/**
 * contracts/dialog.json — modal dialog.
 * roles: trigger button + aria-haspopup="dialog"; panel role="dialog" aria-modal aria-labelledby.
 * focus: opens onto the first control, closes back to the trigger; Tab wraps inside.
 * keys: Escape closes (document listener), Tab/Shift+Tab trapped.
 * css: .overlay / .dialog carry enter motion and the reduced-motion override.
 */
import { useEffect, useId, useRef, useState } from 'react'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function ConfirmOrderDialog({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  // External system: document keyboard — Escape closes, Tab wraps inside the panel. Removed on close.
  useEffect(() => {
    if (!open) return undefined
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="control"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        주문 확인
      </button>
      {open && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && close()}
        >
          <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog">
            <h2 id={titleId}>주문을 확정할까요?</h2>
            <p>확정 후에는 배송지를 바꿀 수 없습니다.</p>
            <div className="dialog-actions">
              <button type="button" className="control" onClick={close}>
                취소
              </button>
              <button
                type="button"
                className="control"
                onClick={() => {
                  onConfirm()
                  close()
                }}
              >
                확정
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

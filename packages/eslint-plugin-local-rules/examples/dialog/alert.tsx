/**
 * contracts/dialog.json — alertdialog variant.
 * Same contract as modal; role="alertdialog" plus aria-describedby on the message, and focus
 * lands on the least destructive action instead of the first control.
 */
import { useEffect, useId, useRef, useState } from 'react'

export default function DeleteAlert({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  // External system: document keyboard — Escape cancels; focus starts on Cancel. Removed on close.
  useEffect(() => {
    if (!open) return undefined
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
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
        삭제
      </button>
      {open && (
        <div className="overlay">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="dialog"
          >
            <h2 id={titleId}>정말 삭제할까요?</h2>
            <p id={descriptionId}>이 작업은 되돌릴 수 없습니다.</p>
            <div className="dialog-actions">
              <button ref={cancelRef} type="button" className="control" onClick={close}>
                취소
              </button>
              <button
                type="button"
                className="control"
                onClick={() => {
                  onDelete()
                  close()
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * contracts/button.json — basic and pending.
 * keys: Enter/Space come free from <button>.
 * css.pending: aria-busy + label swap, width fixed by min-width so the layout does not jump.
 * steps.click-feedback: the pending state flips synchronously before the await.
 */
import { useState, useTransition } from 'react'

export default function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  const [pending, startTransition] = useTransition()
  const [savedCount, setSavedCount] = useState(0)

  const save = () =>
    startTransition(async () => {
      await onSave()
      setSavedCount((count) => count + 1)
    })

  return (
    <button
      type="button"
      className="control"
      aria-busy={pending}
      disabled={pending}
      style={{ minWidth: 96 }}
      onClick={save}
    >
      {pending ? '저장 중…' : `저장 (${savedCount})`}
    </button>
  )
}

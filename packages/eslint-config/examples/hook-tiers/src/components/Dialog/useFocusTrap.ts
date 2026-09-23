import { useEffect, useRef } from 'react'

export function useFocusTrap(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  // DOM focus: move focus into the dialog once it mounts; nothing to clean up.
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return ref
}

import { useRef } from 'react'

export function useFocus(): React.RefObject<HTMLButtonElement | null> {
  return useRef<HTMLButtonElement>(null)
}

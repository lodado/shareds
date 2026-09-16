/**
 * contracts/menu-button.json.
 * roles: trigger button + aria-haspopup="menu" aria-expanded aria-controls; ul role="menu"; li role="menuitem".
 * focus: roving tabindex — the active item is 0, the rest -1; focus moves with `active`.
 * keys: Enter/Space/ArrowDown open on the first item, ArrowUp opens on the last, ArrowDown/ArrowUp
 *       cycle, Home/End jump, Escape closes back to the trigger.
 */
import { useEffect, useId, useRef, useState } from 'react'

const ITEMS = ['복제', '이름 변경', '삭제'] as const

export default function ActionsMenu({ onAction }: { onAction: (item: string) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // External system: DOM focus follows the active item while the menu is open. Nothing to clean up.
  useEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  const openAt = (index: number) => {
    setActive(index)
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }
  const choose = (item: string) => {
    onAction(item)
    close()
  }

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAt(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAt(ITEMS.length - 1)
    }
  }

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const last = ITEMS.length - 1
    if (event.key === 'ArrowDown') setActive((index) => (index === last ? 0 : index + 1))
    else if (event.key === 'ArrowUp') setActive((index) => (index === 0 ? last : index - 1))
    else if (event.key === 'Home') setActive(0)
    else if (event.key === 'End') setActive(last)
    else if (event.key === 'Escape' || event.key === 'Tab') close()
    else if (event.key === 'Enter' || event.key === ' ') choose(ITEMS[active])
    else return
    event.preventDefault()
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        className="control"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close() : openAt(0))}
        onKeyDown={onTriggerKeyDown}
      >
        작업 ▾
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="작업" className="popup">
          {ITEMS.map((item, index) => (
            <div
              key={item}
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              role="menuitem"
              tabIndex={index === active ? 0 : -1}
              data-active={index === active}
              className="item"
              onMouseEnter={() => setActive(index)}
              onKeyDown={onMenuKeyDown}
              onClick={() => choose(item)}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

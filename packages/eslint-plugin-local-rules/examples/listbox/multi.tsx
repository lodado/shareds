/**
 * contracts/listbox.json — multi select.
 * aria-multiselectable="true"; focus (active) and selection are separate, so Space toggles the
 * active option and Shift+ArrowDown/Up extends the selection. Ctrl/Cmd+A selects all.
 */
import { useId, useState } from 'react'

const TOPPINGS = ['치즈', '올리브', '버섯', '페퍼로니', '파인애플']

export default function ToppingListbox() {
  const [active, setActive] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const prefix = useId()
  const optionId = (index: number) => `${prefix}-${index}`

  const toggle = (index: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  const move = (index: number, extend: boolean) => {
    setActive(index)
    if (extend) setSelected((current) => new Set(current).add(index))
  }

  const indexFromClick = (event: React.MouseEvent) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]')
    return option ? Number(option.dataset.index) : -1
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = TOPPINGS.length - 1
    if (event.key === 'ArrowDown') move(Math.min(active + 1, last), event.shiftKey)
    else if (event.key === 'ArrowUp') move(Math.max(active - 1, 0), event.shiftKey)
    else if (event.key === 'Home') move(0, event.shiftKey)
    else if (event.key === 'End') move(last, event.shiftKey)
    else if (event.key === ' ') toggle(active)
    else if (event.key === 'a' && (event.metaKey || event.ctrlKey))
      setSelected(new Set(TOPPINGS.map((_, index) => index)))
    else return
    event.preventDefault()
  }

  return (
    <div
      role="listbox"
      aria-label="토핑"
      aria-multiselectable="true"
      tabIndex={0}
      aria-activedescendant={optionId(active)}
      className="popup listbox"
      style={{ width: 200 }}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const index = indexFromClick(event)
        if (index === -1) return
        setActive(index)
        toggle(index)
      }}
    >
      {TOPPINGS.map((topping, index) => (
        <div
          key={topping}
          id={optionId(index)}
          role="option"
          tabIndex={-1}
          aria-selected={selected.has(index)}
          data-active={index === active}
          data-index={index}
          className="item"
        >
          {topping}
        </div>
      ))}
    </div>
  )
}

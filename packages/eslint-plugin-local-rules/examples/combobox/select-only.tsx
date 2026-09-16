/**
 * contracts/combobox.json — select-only combobox (no typing).
 * The trigger is a div role="combobox" with tabIndex=0 because the APG pattern's value is not an
 * input; aria-autocomplete is omitted. Keys match the editable variant, plus Space toggles.
 */
import { useId, useState } from 'react'

const SIZES = ['S', 'M', 'L', 'XL']

export default function SizeSelect() {
  const [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const optionId = (index: number) => `${listId}-${index}`

  const choose = (index: number) => {
    setSelected(SIZES[index])
    setOpen(false)
  }

  const indexFromClick = (event: React.MouseEvent) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]')
    return option ? Number(option.dataset.index) : -1
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = SIZES.length - 1
    if (event.key === 'ArrowDown') {
      if (!open) setOpen(true)
      else setActive((index) => Math.min(index + 1, last))
    } else if (event.key === 'ArrowUp') {
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Home') setActive(0)
    else if (event.key === 'End') setActive(last)
    else if (event.key === 'Enter' || event.key === ' ') {
      if (open) choose(active)
      else setOpen(true)
    } else if (event.key === 'Escape') setOpen(false)
    else return
    event.preventDefault()
  }

  return (
    <div style={{ position: 'relative', width: 160 }}>
      <span id={`${listId}-label`}>사이즈</span>
      <div
        role="combobox"
        tabIndex={0}
        className="control"
        aria-labelledby={`${listId}-label`}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        {selected ?? '선택'}
      </div>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-labelledby={`${listId}-label`}
          className="popup"
          style={{ width: '100%' }}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            const index = indexFromClick(event)
            if (index !== -1) choose(index)
          }}
        >
          {SIZES.map((size, index) => (
            <div
              key={size}
              id={optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={size === selected}
              data-active={index === active}
              data-index={index}
              className="item"
            >
              {size}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

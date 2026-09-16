/**
 * contracts/combobox.json — editable input with list autocomplete.
 * roles: input role="combobox" aria-expanded aria-controls aria-autocomplete="list" aria-activedescendant;
 *        ul role="listbox"; li role="option" aria-selected.
 * focus: stays on the input; the active option is announced through aria-activedescendant.
 * keys: ArrowDown opens / moves down, ArrowUp moves up, Enter selects and closes, Escape closes
 *       (or clears when already closed), Home/End are left to the input caret.
 * css: .popup is as wide as the input; the active option scrolls into view.
 */
import { useId, useState } from 'react'

const CITIES = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종']

export default function CityCombobox() {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()

  const options = CITIES.filter((city) => city.includes(value))
  const optionId = (index: number) => `${listId}-${index}`
  const hasActiveOption = open && active < options.length
  const activeDescendant = hasActiveOption ? optionId(active) : undefined

  const indexFromClick = (event: React.MouseEvent) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]')
    return option ? Number(option.dataset.index) : -1
  }

  const select = (city: string) => {
    setValue(city)
    setOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      if (!open) setOpen(true)
      else setActive((index) => Math.min(index + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && open && options[active]) {
      select(options[active])
    } else if (event.key === 'Escape') {
      if (open) setOpen(false)
      else setValue('')
    } else return
    event.preventDefault()
  }

  return (
    <div style={{ position: 'relative', width: 240 }}>
      <label htmlFor={`${listId}-input`}>도시</label>
      <input
        id={`${listId}-input`}
        role="combobox"
        className="control"
        style={{ width: '100%' }}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {open && options.length > 0 && (
        <div
          id={listId}
          role="listbox"
          aria-label="도시 제안"
          className="popup"
          style={{ width: '100%' }}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            const index = indexFromClick(event)
            if (index !== -1) select(options[index])
          }}
        >
          {options.map((city, index) => (
            <div
              key={city}
              id={optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              data-active={index === active}
              className="item"
              data-index={index}
              ref={(element) => {
                if (index === active) element?.scrollIntoView({ block: 'nearest' })
              }}
            >
              {city}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

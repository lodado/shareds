/**
 * contracts/listbox.json — single select.
 * roles: ul role="listbox" tabIndex=0 aria-activedescendant; li role="option" tabIndex={-1} aria-selected.
 * focus: the list holds focus; the active option is announced by aria-activedescendant.
 * keys: ArrowDown/ArrowUp move (and select — single-select follows focus), Home/End jump,
 *       typing a character jumps to the next match.
 * css: selected shows a check glyph and weight; active shows a background.
 */
import { useId, useState } from 'react'

const FRUITS = ['사과', '바나나', '포도', '수박', '참외']

export default function FruitListbox() {
  const [selected, setSelected] = useState(0)
  const prefix = useId()
  const optionId = (index: number) => `${prefix}-${index}`

  const indexFromClick = (event: React.MouseEvent) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]')
    return option ? Number(option.dataset.index) : -1
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = FRUITS.length - 1
    if (event.key === 'ArrowDown') setSelected((index) => Math.min(index + 1, last))
    else if (event.key === 'ArrowUp') setSelected((index) => Math.max(index - 1, 0))
    else if (event.key === 'Home') setSelected(0)
    else if (event.key === 'End') setSelected(last)
    else if (event.key.length === 1) {
      const next = FRUITS.findIndex((fruit, index) => index > selected && fruit.startsWith(event.key))
      if (next !== -1) setSelected(next)
    } else return
    event.preventDefault()
  }

  return (
    <div
      role="listbox"
      aria-label="과일"
      tabIndex={0}
      aria-activedescendant={optionId(selected)}
      className="popup listbox"
      style={{ width: 200 }}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const index = indexFromClick(event)
        if (index !== -1) setSelected(index)
      }}
    >
      {FRUITS.map((fruit, index) => (
        <div
          key={fruit}
          id={optionId(index)}
          role="option"
          tabIndex={-1}
          aria-selected={index === selected}
          data-index={index}
          className="item"
        >
          {fruit}
        </div>
      ))}
    </div>
  )
}

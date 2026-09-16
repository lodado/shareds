/**
 * contracts/tabs.json — manual activation.
 * Arrow keys move focus only; Enter/Space (or click) selects. Use when switching a panel is
 * expensive (network) so keyboard users can skim tabs without loading each one.
 */
import { useId, useRef, useState } from 'react'

const TABS = [
  { id: 'daily', label: '일간' },
  { id: 'weekly', label: '주간' },
  { id: 'monthly', label: '월간' },
]

export default function ReportTabs() {
  const [selected, setSelected] = useState(0)
  const [focused, setFocused] = useState(0)
  const prefix = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const moveFocus = (index: number) => {
    setFocused(index)
    tabRefs.current[index]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = TABS.length - 1
    if (event.key === 'ArrowRight') moveFocus(index === last ? 0 : index + 1)
    else if (event.key === 'ArrowLeft') moveFocus(index === 0 ? last : index - 1)
    else if (event.key === 'Home') moveFocus(0)
    else if (event.key === 'End') moveFocus(last)
    else if (event.key === 'Enter' || event.key === ' ') setSelected(index)
    else return
    event.preventDefault()
  }

  return (
    <div>
      <div role="tablist" aria-label="리포트 기간" className="tablist">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`${prefix}-tab-${tab.id}`}
            aria-selected={index === selected}
            aria-controls={`${prefix}-panel-${tab.id}`}
            tabIndex={index === focused ? 0 : -1}
            className="tab"
            onClick={() => {
              setFocused(index)
              setSelected(index)
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {TABS.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${prefix}-panel-${tab.id}`}
          aria-labelledby={`${prefix}-tab-${tab.id}`}
          hidden={index !== selected}
          className="tabpanel"
        >
          {tab.label} 리포트
        </div>
      ))}
    </div>
  )
}

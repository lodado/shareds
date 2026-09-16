/**
 * contracts/tabs.json — automatic activation.
 * roles: div role="tablist"; button role="tab" aria-selected aria-controls; div role="tabpanel" aria-labelledby.
 * focus: roving tabindex, exactly one tab is 0. Arrow moves focus and selects at once.
 * keys: ArrowRight/ArrowLeft cycle, Home/End jump.
 * css: .tab[aria-selected] carries a border and weight, not colour alone.
 */
import { useId, useRef, useState } from 'react'

const TABS = [
  { id: 'overview', label: '개요', body: '상품 개요입니다.' },
  { id: 'reviews', label: '리뷰', body: '리뷰 12건.' },
  { id: 'shipping', label: '배송', body: '영업일 기준 2–3일.' },
]

export default function ProductTabs() {
  const [selected, setSelected] = useState(0)
  const prefix = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const activate = (index: number) => {
    setSelected(index)
    tabRefs.current[index]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = TABS.length - 1
    if (event.key === 'ArrowRight') activate(index === last ? 0 : index + 1)
    else if (event.key === 'ArrowLeft') activate(index === 0 ? last : index - 1)
    else if (event.key === 'Home') activate(0)
    else if (event.key === 'End') activate(last)
    else return
    event.preventDefault()
  }

  return (
    <div>
      <div role="tablist" aria-label="상품 정보" className="tablist">
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
            tabIndex={index === selected ? 0 : -1}
            className="tab"
            onClick={() => setSelected(index)}
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
          {tab.body}
        </div>
      ))}
    </div>
  )
}

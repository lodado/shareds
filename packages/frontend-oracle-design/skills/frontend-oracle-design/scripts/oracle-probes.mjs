// 환경 밖 교란 — 모델 환경이 허용하지 않는 사건을 공간의 trace에 끼운다. 생성 테스트는 이 trace를 제품에 돌려 무시하는지,
// 화면을 바꾸는지, 던지는지 보고만 한다(기대값은 정책이라 모델이 말하지 않는다).

import { isDeepStrictEqual } from 'node:util'
import { stableStringify } from './oracle-fs.mjs'
import { toPlain } from './oracle-types.mjs'

const MAX_PERTURBATIONS = 5000

const listItems = (list) => {
  const items = []
  for (let cursor = list; cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)
  return items
}
const listOf = (items) => items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })

/** trace가 환경 안에 있는지 — 처음으로 벗어나는 위치(leaveAt)와 그때까지의 런타임 사건. */
function traceStatus(model, plainTrace) {
  const raw = []
  for (const [index, event] of plainTrace.entries()) {
    const allowed = listItems(model.next(listOf(raw)))
    const match = allowed.find((choice) => isDeepStrictEqual(toPlain(choice), event))
    if (!match) return { inSpace: false, leaveAt: index, raw }
    raw.push(match)
  }
  return { inSpace: true, raw }
}

/** 공간이 쓴 사건 종류별 예시 하나와, 정수 필드별 최댓값(`Tag.field` → max). */
function eventShapes(space) {
  const numeric = new Map()
  const example = new Map()
  for (const event of space.cases.flatMap((entry) => entry.trace)) {
    if (!example.has(event.$)) example.set(event.$, event)
    for (const [field, value] of Object.entries(event)) {
      if (field === '$' || !Number.isInteger(value)) continue
      const slot = `${event.$}.${field}`
      numeric.set(slot, Math.max(numeric.get(slot) ?? 0, value))
    }
  }
  return { numeric: [...numeric].sort(), example }
}

/** 한 trace에서 만드는 교란 후보: 각 위치에 경계값 사건을 끼우기, 그리고 중복·인접 교환·앞당김. */
function* candidatesOf(trace, { numeric, example }) {
  for (let position = 0; position <= trace.length; position += 1) {
    const prefix = trace.slice(0, position)
    for (const [slot, max] of numeric) {
      const [tag, field] = slot.split('.')
      yield ['boundary', `${slot}=zero`, [...prefix, { ...example.get(tag), [field]: 0 }]]
      yield ['boundary', `${slot}=past-max`, [...prefix, { ...example.get(tag), [field]: max + 1 }]]
    }
  }
  for (let index = 0; index < trace.length; index += 1) {
    yield ['duplicate', 'duplicate', [...trace.slice(0, index + 1), trace[index], ...trace.slice(index + 1)]]
    if (index + 1 < trace.length)
      yield ['swap', 'swap', [...trace.slice(0, index), trace[index + 1], trace[index], ...trace.slice(index + 2)]]
    if (index > 0) yield ['early', 'early', [trace[index], ...trace.slice(0, index), ...trace.slice(index + 1)]]
  }
}

/**
 * 환경이 허용하지 않는 사건을 공간의 trace에 끼운다: 필드 경계값(0, 공간이 쓴 최댓값+1), 중복, 인접 교환, 앞당김.
 * 공간 안에 남는 교란은 대응 검사가 이미 덮으므로 버린다. 결과는 제품에 돌릴 trace와 처음 벗어나는 위치다.
 */
export function perturbations(model, space) {
  const shapes = eventShapes(space)
  const out = new Map()
  for (const [kind, key, trace] of space.cases.flatMap((entry) => [...candidatesOf(entry.trace, shapes)])) {
    const id = stableStringify(trace)
    const status = out.has(id) ? null : traceStatus(model, trace)
    if (status === null || status.inSpace) continue
    if (out.size >= MAX_PERTURBATIONS) return { list: [...out.values()], capped: true }
    const at = kind === 'boundary' ? '' : `:${trace[status.leaveAt].$}`
    out.set(id, { kind, key: `${key}${at}`, trace, leaveAt: status.leaveAt })
  }
  return { list: [...out.values()], capped: false }
}

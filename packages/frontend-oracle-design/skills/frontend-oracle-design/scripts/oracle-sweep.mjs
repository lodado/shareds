// 한 번에 다 모으는 스윕 — 모델이 고른 긴 무작위 걸음을 제품에 걸고, 첫 불일치에서 멈추지 않고 걸음마다 새로 시작해
// 어긋남을 종류별로 묶는다. 생성 테스트의 fast-check 표본은 반례 하나를 줄여 보여 주므로, 어긋남이 여럿이면 고치고 다시
// 도는 일을 어긋남 수만큼 되풀이한다. 잠근 모델은 고칠 수 없어서 그 한 바퀴마다 새 revision이 든다 — 스윕은 그 목록을
// 한 번에 내놓는다. 이 파일의 함수는 생성 테스트에 `toString()`으로 실려 제품 러너 안에서 돈다: 바깥 이름을 쓰지 않고,
// 서로를 이름으로만 부른다.

/** 기대 관찰과 실제 관찰이 다른 경로 — 둘 다 평범한 JSON 값이다. 길이가 다른 배열은 `<경로>.length` 하나다. */
export function diffPaths(expected, observed, path = '$') {
  if (Object.is(expected, observed)) return []
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (Array.isArray(expected) && Array.isArray(observed)) {
    if (expected.length !== observed.length) return [`${path}.length`]
    return expected.flatMap((value, index) => diffPaths(value, observed[index], `${path}[${index}]`))
  }
  if (isObject(expected) && isObject(observed)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(observed)])]
    return keys.flatMap((key) => diffPaths(expected[key], observed[key], `${path}.${key}`))
  }
  return [path]
}

/** 시드가 같으면 같은 수열 — mulberry32. 걸음 번호와 시드만 알면 그 걸음을 다시 걸을 수 있다. */
export function randomOf(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** 보고에 싣는 값은 잘라서 싣는다 — 관찰 하나가 수십 KB일 수 있다. */
export function clipped(value, limit = 400) {
  const text = JSON.stringify(value) ?? 'undefined'
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/**
 * 걸음 `walks`개를 걷는다. 걸음마다: 제품을 init하고, 모델이 허용하는 사건 가운데 하나를 골라 모델과 제품에 같이 적용하고,
 * 관찰을 견준다. 첫 불일치(또는 제품이 던진 오류)를 그 걸음의 결과로 적고 걸음을 끝낸다 — 어긋난 뒤의 제품 상태는 모델과
 * 갈라져 있어 이어 걸으면 같은 결함이 연쇄로 보인다. 어긋남은 `사건 종류 → 다른 관찰 경로`로 묶고, 묶음마다 가장 짧은
 * 반례를 남긴다. 걸음마다 사건 종류의 일부를 끈다(swarm): 한 묶음이 걸음 대부분을 끝내도 그 종류를 뺀 걸음은 그 너머를 본다.
 */
export async function sweep({ adapter, call, toPlain, within, eventLabel, walks, steps, seed }) {
  const listOf = (items) => items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
  const allowedAfter = (raw) => {
    const items = []
    for (let cursor = call('next', listOf(raw)); cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)
    return items
  }
  const abortAfter = 3
  const clusters = new Map()
  const kinds = new Map()
  const counts = { steps: 0, ended: 0, timeouts: 0 }
  const note = (key, walk, trace, expected, observed) => {
    const found = clusters.get(key) ?? { key, count: 0, walks: [], shortest: null }
    found.count += 1
    if (found.walks.length < 3) found.walks.push(walk)
    if (found.shortest === null || trace.length < found.shortest.trace.length)
      found.shortest = { trace: [...trace], at: trace.length, expected: clipped(expected), observed: clipped(observed) }
    clusters.set(key, found)
  }
  const thrown = (error) => String(error?.message ?? error).split('\n')[0].slice(0, 120)
  const generic = (path) => path.replaceAll(/\[\d+\]/g, '[]')

  for (let walk = 0; walk < walks && counts.timeouts < abortAfter; walk += 1) {
    const random = randomOf(seed * 1_000_003 + walk)
    const off = new Map()
    const raw = []
    const trace = []
    let model = call('init')
    let state
    try {
      state = await within(adapter.init(), 'init')
      const initial = toPlain(call('observe', model))
      const shown = await within(adapter.observe(state), 'initial observe')
      const first = diffPaths(initial, shown)
      if (first.length > 0) note(`init → ${[...new Set(first.map(generic))].join(', ')}`, walk, trace, initial, shown)
      for (let index = 0; first.length === 0 && index < steps; index += 1) {
        const all = allowedAfter(raw)
        if (all.length === 0) {
          counts.ended += 1
          break
        }
        const live = all.filter((candidate) => {
          const kind = toPlain(candidate).$
          if (!off.has(kind)) off.set(kind, random() < 0.25)
          return !off.get(kind)
        })
        const pool = live.length > 0 ? live : all
        const event = pool[Math.floor(random() * pool.length)]
        const plain = toPlain(event)
        const kind = plain.$ ?? 'event'
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
        raw.push(event)
        trace.push(plain)
        model = call('step', model, event)
        const expected = toPlain(call('observe', model))
        let observed
        try {
          state = await within(adapter.step(state, structuredClone(plain)), `step ${eventLabel(plain)}`)
          observed = await within(adapter.observe(state), `observe after ${eventLabel(plain)}`)
        } catch (error) {
          if (String(error?.message).startsWith('ADAPTER_TIMEOUT')) counts.timeouts += 1
          note(`${kind} → throws: ${thrown(error)}`, walk, trace, expected, null)
          break
        }
        counts.steps += 1
        const paths = diffPaths(expected, observed)
        if (paths.length > 0) {
          note(`${kind} → ${[...new Set(paths.map(generic))].join(', ')}`, walk, trace, expected, observed)
          break
        }
      }
    } catch (error) {
      note(`init → throws: ${thrown(error)}`, walk, trace, null, null)
    } finally {
      if (adapter.dispose && state !== undefined) await within(adapter.dispose(state), 'dispose')
    }
  }
  return {
    walks,
    steps,
    seed,
    stepsRun: counts.steps,
    endedByEnvironment: counts.ended,
    ...(counts.timeouts >= abortAfter ? { aborted: `ADAPTER_TIMEOUT ${counts.timeouts} times — the adapter hangs, fix it first` } : {}),
    events: Object.fromEntries([...kinds].sort(([left], [right]) => left.localeCompare(right))),
    clusters: [...clusters.values()].sort((left, right) => right.count - left.count || left.key.localeCompare(right.key)),
  }
}

/** 생성 테스트가 싣는 함수들 — 서로를 이름으로 부르므로 함께 싣는다. */
export const SWEEP_FUNCTIONS = [diffPaths, randomOf, clipped, sweep]

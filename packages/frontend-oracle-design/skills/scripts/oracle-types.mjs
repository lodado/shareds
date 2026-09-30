// Bend `type` 선언 → 도메인 IR. fast-check arbitrary·전수 목록·경우의 수·값 변환이 모두 이 IR 하나에서 나온다 —
// 테스트 입력 공간이 모델 타입과 따로 적히지 않게 한다. 값은 컴파일된 Bend(`bend -o *.mjs`)의 런타임 표현 그대로다:
// Bool은 boolean, Nat은 BigInt, List는 {$:'Con',head,tail}/{$:'Nil'}, Maybe는 {$:'Some',value}/{$:'None'},
// 데이터는 {$:<생성자>, ...필드}. TS 값으로 바꾸는 일은 adapter만 한다.

export const EXHAUSTIVE_THRESHOLD = 256

class UnsupportedType extends Error {
  constructor(message) {
    super(message)
    this.code = 'TYPE_UNSUPPORTED'
  }
}

/** 파일 안의 `type X is Data:` 선언 전부 → 이름 → 생성자·필드(타입은 원문). 제네릭 사용자 타입은 다루지 않는다. */
export function parseBendTypes(text) {
  const types = new Map()
  let current = null
  for (const line of text.split('\n')) {
    const head = line.match(/^type\s+(\w+)\s+is\s+Data\s*:\s*$/)
    if (head) {
      current = []
      types.set(head[1], current)
      continue
    }
    const declared = current && line.match(/^\s+(\w+)\{(.*)\}\s*$/)
    if (declared) {
      current.push({ name: declared[1], fields: splitFields(declared[2]) })
    } else if (line.trim() && !/^\s/.test(line)) {
      current = null
    }
  }
  return types
}

/** `a: Bool, b: List<&2, Nat>` → 필드 목록. 꺾쇠 안의 쉼표는 나누지 않는다. */
function splitFields(text) {
  const fields = []
  let depth = 0
  let start = 0
  for (let index = 0; index <= text.length; index += 1) {
    const char = text[index]
    if (char === '<') depth += 1
    else if (char === '>') depth -= 1
    else if ((char === ',' && depth === 0) || index === text.length) {
      const part = text.slice(start, index).trim()
      if (part) {
        const colon = part.indexOf(':')
        fields.push({ name: part.slice(0, colon).trim(), type: part.slice(colon + 1).trim() })
      }
      start = index + 1
    }
  }
  return fields
}

/**
 * 타입 원문 → IR. bounds: { nat: 상한(포함), list: 최대 길이 } — 무한 도메인은 상한이 있어야 표본을 만들 수 있고,
 * 상한은 결과의 범위에 그대로 남는다(도메인을 줄였다는 사실이 숨지 않게).
 */
export function typeIR(source, types, bounds = {}, seen = new Set()) {
  const text = source
    .replace(/^\+/, '')
    .replace(/^\w+\./, '')
    .trim()
  if (text === 'Bool') return { kind: 'bool' }
  if (text === 'Nat') return { kind: 'nat', max: bounds.nat ?? null }
  const generic = /^(List|Maybe)</.exec(text)
  if (generic && text.endsWith('>')) {
    const inner = text
      .slice(generic[0].length, -1)
      .replace(/^&\d+,/, '')
      .trim()
    const of = typeIR(inner, types, bounds, seen)
    return generic[1] === 'List' ? { kind: 'list', of, maxLength: bounds.list ?? null } : { kind: 'maybe', of }
  }
  const constructors = types.get(text)
  if (!constructors)
    throw new UnsupportedType(`type ${source} is not Bool, Nat, List, Maybe or a data type in this file`)
  if (seen.has(text)) throw new UnsupportedType(`recursive type ${text} is not supported`)
  const inner = new Set([...seen, text])
  return {
    kind: 'data',
    name: text,
    constructors: constructors.map(({ name, fields }) => ({
      name,
      fields: fields.map((field) => ({ name: field.name, type: typeIR(field.type, types, bounds, inner) })),
    })),
  }
}

/** 값의 개수. 상한 없는 Nat·List는 Infinity다. */
export function cardinality(ir) {
  switch (ir.kind) {
    case 'bool': {
      return 2
    }
    case 'nat': {
      return ir.max === null ? Infinity : ir.max + 1
    }
    case 'maybe': {
      return 1 + cardinality(ir.of)
    }
    case 'list': {
      if (ir.maxLength === null) return Infinity
      const base = cardinality(ir.of)
      let total = 0
      for (let length = 0; length <= ir.maxLength; length += 1) total += base ** length
      return total
    }
    default: {
      return ir.constructors.reduce(
        (sum, { fields }) => sum + fields.reduce((product, field) => product * cardinality(field.type), 1),
        0,
      )
    }
  }
}

const listOf = (items) => items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })

/** 유한 도메인의 모든 값(런타임 표현). 순서는 선언 순서·작은 값 먼저로 고정이다. */
export function valuesOf(ir) {
  const limit = cardinality(ir)
  if (!Number.isFinite(limit)) throw new UnsupportedType('valuesOf needs a finite domain — set the Nat and List bounds')
  switch (ir.kind) {
    case 'bool': {
      return [false, true]
    }
    case 'nat': {
      return Array.from({ length: ir.max + 1 }, (_, index) => BigInt(index))
    }
    case 'maybe': {
      return [{ $: 'None' }, ...valuesOf(ir.of).map((value) => ({ $: 'Some', value }))]
    }
    case 'list': {
      const items = valuesOf(ir.of)
      let layer = [[]]
      const all = [[]]
      for (let length = 1; length <= ir.maxLength; length += 1) {
        layer = layer.flatMap((prefix) => items.map((item) => [...prefix, item]))
        all.push(...layer)
      }
      return all.map(listOf)
    }
    default: {
      return ir.constructors.flatMap(({ name, fields }) => {
        let partial = [{ $: name }]
        for (const field of fields) {
          const options = valuesOf(field.type)
          partial = partial.flatMap((value) => options.map((option) => ({ ...value, [field.name]: option })))
        }
        return partial
      })
    }
  }
}

/**
 * IR → fast-check arbitrary(런타임 표현). 생성 테스트에 이 함수의 원문이 그대로 들어간다 — 바깥 이름을 참조하지 않는다.
 * shrink는 fast-check 기본을 따른다: Bool은 false, Nat은 0, List는 짧게, 합 타입은 앞 생성자 쪽으로.
 */
export function arbitraryOf(fc, ir) {
  const build = (node) => {
    switch (node.kind) {
      case 'bool': {
        return fc.boolean()
      }
      case 'nat': {
        if (node.max === null) throw new Error('arbitraryOf: set a Nat bound for sampling')
        return fc.bigInt({ min: 0n, max: BigInt(node.max) })
      }
      case 'maybe': {
        return fc
          .option(build(node.of), { nil: null })
          .map((value) => (value === null ? { $: 'None' } : { $: 'Some', value }))
      }
      case 'list': {
        if (node.maxLength === null) throw new Error('arbitraryOf: set a List bound for sampling')
        return fc
          .array(build(node.of), { maxLength: node.maxLength })
          .map((items) => items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' }))
      }
      default: {
        const options = node.constructors.map(({ name, fields }) =>
          fields.length === 0
            ? fc.constant({ $: name })
            : fc
                .tuple(...fields.map((field) => build(field.type)))
                .map((values) =>
                  Object.fromEntries([['$', name], ...fields.map((field, index) => [field.name, values[index]])]),
                ),
        )
        return options.length === 1 ? options[0] : fc.oneof(...options)
      }
    }
  }
  return build(ir)
}

/** 런타임 값 → 비교·JSON용 plain. Nat은 number(안전 범위 밖이면 문자열), List는 배열, 생성자는 `$`를 유지한다(생성 테스트에 원문이 들어간다). */
export function toPlain(value) {
  if (typeof value === 'bigint') return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString()
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(toPlain)
  if (value.$ === 'Nil' || value.$ === 'Con') {
    const items = []
    for (let cursor = value; cursor?.$ === 'Con'; cursor = cursor.tail) items.push(toPlain(cursor.head))
    return items
  }
  if (value.$ === 'True' || value.$ === 'False') return value.$ === 'True'
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, toPlain(field)]))
}

/**
 * plain → 런타임 값. adapter가 돌려준 투영값을 컴파일된 def에 넣기 전에 쓴다. 타입과 모양이 다르면 throw — 잘못된
 * 투영을 조용히 다른 값으로 바꾸면 판정이 무의미해진다. 생성 테스트에 원문이 들어가므로 바깥 이름을 참조하지 않는다.
 */
export function toRuntime(plain, ir, path = 'value') {
  const fail = (expected) => {
    throw Object.assign(new Error(`${path}: expected ${expected}, got ${JSON.stringify(plain)}`), {
      code: 'PROJECTION_SHAPE',
    })
  }
  switch (ir.kind) {
    case 'bool': {
      if (typeof plain !== 'boolean') fail('a boolean')
      return plain
    }
    case 'nat': {
      if (!Number.isSafeInteger(plain) || plain < 0) fail('a non-negative integer')
      return BigInt(plain)
    }
    case 'maybe': {
      if (plain?.$ === 'None') return { $: 'None' }
      if (plain?.$ !== 'Some') fail('{$:"None"} or {$:"Some",value}')
      return { $: 'Some', value: toRuntime(plain.value, ir.of, `${path}.value`) }
    }
    case 'list': {
      if (!Array.isArray(plain)) fail('an array')
      return plain
        .map((item, index) => toRuntime(item, ir.of, `${path}[${index}]`))
        .reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
    }
    default: {
      const declared = ir.constructors.find(({ name }) => name === plain?.$)
      if (!declared) fail(`one of ${ir.constructors.map(({ name }) => name).join(', ')}`)
      const extra = Object.keys(plain).filter(
        (key) => key !== '$' && !declared.fields.some((field) => field.name === key),
      )
      if (extra.length > 0) fail(`only the fields of ${declared.name}, not ${extra.join(', ')}`)
      return Object.fromEntries([
        ['$', declared.name],
        ...declared.fields.map((field) => [
          field.name,
          toRuntime(plain[field.name], field.type, `${path}.${field.name}`),
        ]),
      ])
    }
  }
}

/** plain → Bend 리터럴(모듈 별칭 `M.` 포함). 커널이 재확인하는 witness law 본문에 쓴다. */
export function bendLiteral(plain, ir) {
  switch (ir.kind) {
    case 'bool': {
      return plain ? 'True{}' : 'False{}'
    }
    case 'nat': {
      return `${plain}n`
    }
    case 'maybe': {
      return plain.$ === 'None' ? 'None{}' : `Some{${bendLiteral(plain.value, ir.of)}}`
    }
    case 'list': {
      return `[${plain.map((item) => bendLiteral(item, ir.of)).join(', ')}]`
    }
    default: {
      const declared = ir.constructors.find(({ name }) => name === plain.$)
      return `M.${declared.name}{${declared.fields
        .map((field) => bendLiteral(plain[field.name], field.type))
        .join(', ')}}`
    }
  }
}

/** IR → Bend 타입 표기(모듈 별칭 `M.` 포함). */
export function bendTypeName(ir) {
  if (ir.kind === 'bool') return 'Bool'
  if (ir.kind === 'nat') return 'Nat'
  if (ir.kind === 'list') return `List<${bendTypeName(ir.of)}>`
  if (ir.kind === 'maybe') return `Maybe<${bendTypeName(ir.of)}>`
  return `M.${ir.name}`
}

/** `def Prefix.name(a: A, b: B) -> R:` 서명 → 인자·반환 타입 원문. 없으면 null. */
export function defSignature(text, name) {
  const escaped = name.replaceAll('.', String.raw`\.`)
  const match = text.match(new RegExp(`^def\\s+${escaped}\\((.*)\\)\\s*->\\s*(.+?):\\s*$`, 'm'))
  if (!match) return null
  return {
    params: splitFields(match[1]).map(({ name: parameter, type }) => ({ name: parameter.replace(/^[+-]/, ''), type })),
    returns: match[2].trim(),
  }
}

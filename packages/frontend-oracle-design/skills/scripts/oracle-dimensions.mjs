#!/usr/bin/env node
// 정적 dimension miner — 고정 패턴 표로 코드에서 Case space 후보 행과 side-effect 인벤토리를 뽑는다.
// 카드에 자동 기입하지 않는다: 정적 분석 → 후보 → 사람·LLM의 disposition. 검출 0은 차원 없음의 증거가 아니다.
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { scanSideEffects } from './oracle-fs.mjs'

/** family는 case-space.md의 8계열 중 하나. `and`는 같은 파일에 함께 있어야 성립하는 짝, `minimum`은 최소 hit 수. */
export const DIMENSION_PATTERNS = [
  {
    family: 'Order',
    dimension: 'response order',
    pattern: /Promise\.(?:all|race|allSettled)\(/,
    note: 'several requests in one scope — which response wins',
  },
  {
    family: 'Order',
    dimension: 'request interleaving',
    pattern: /\bfetch\(|\baxios[.(]|\bky[.(]|useQuery\(|useMutation\(/,
    minimum: 2,
    note: 'two or more requests in one file — count and interleaving under user speed',
  },
  {
    family: 'Environment',
    dimension: 'StrictMode double-invoke',
    pattern: /useEffect\(/,
    and: /set(?:Timeout|Interval)\(|\.subscribe\(|addEventListener\(|\.observe\(/,
    note: 'an effect owning a timer·subscription — does cleanup restore every paired state on re-invoke',
  },
  {
    family: 'Environment',
    dimension: 'measured layout',
    pattern: /ResizeObserver|IntersectionObserver|getBoundingClientRect\(|getComputedStyle\(/,
    note: 'the initial default → first measured value fires as a change',
  },
  {
    family: 'Entry',
    dimension: 'remount',
    pattern: /<Suspense|React\.lazy\(|\blazy\(|\bkey=\{/,
    note: 'mount-time side effects on remount — scroll·focus·observers re-initialize',
  },
  {
    family: 'Entry',
    dimension: 'navigation',
    pattern: /from ['"](?:next\/router|next\/navigation|react-router(?:-dom)?|@tanstack\/react-router)['"]|useRouter\(|useNavigate\(|useSearchParams\(/,
    note: 'back/forward · deep link · reload · scroll restoration versus the card reset policy',
  },
  {
    family: 'Environment',
    dimension: 'scroll ownership',
    pattern: /useVirtualizer\(|react-window|react-virtual\b|react-virtuoso|\bvirtualizer\b/i,
    note: 'virtualizer mount reset · remeasure · scrollTo — who owns the scroll position',
  },
  {
    family: 'Async',
    dimension: 'cancel · late response',
    pattern: /AbortController|signal:\s*\w+\.signal|\.abort\(\)/,
    note: 'the abort path and the response that lands after leaving',
  },
  {
    family: 'Data',
    dimension: 'persisted state',
    pattern: /localStorage|sessionStorage|indexedDB|document\.cookie/,
    note: 'state that survives reload · another tab · a different entry',
  },
  {
    family: 'Async',
    dimension: 'deferred values',
    pattern: /debounce\(|throttle\(|useDeferredValue\(|startTransition\(/,
    note: 'intermediate values may each spawn a request — request-count contract under scheduling',
  },
]

function matchingLines(lines, pattern) {
  const hits = []
  lines.forEach((line, index) => {
    if (pattern.test(line)) hits.push(index + 1)
  })
  return hits
}

/** 파일 하나의 후보 행 — { family, dimension, citation, note }. citation은 code(path#La-Lb) 형식이라 카드에 그대로 옮길 수 있다. */
export function mineDimensions(path, content) {
  const lines = content.split('\n')
  const candidates = []

  for (const rule of DIMENSION_PATTERNS) {
    const hits = matchingLines(lines, rule.pattern)
    if (hits.length < (rule.minimum ?? 1)) continue
    if (rule.and && matchingLines(lines, rule.and).length === 0) continue
    const first = hits[0]
    const last = hits.at(-1)
    const citation = first === last ? `code(${path}#L${first})` : `code(${path}#L${first}-L${last})`
    candidates.push({ family: rule.family, dimension: rule.dimension, citation, note: rule.note })
  }

  return candidates
}

export function renderReport(files) {
  const candidates = files.flatMap((file) => file.candidates)
  const effects = files.flatMap((file) => file.effects)
  const out = [`## Dimension candidates — ${files.length} files`, '']
  if (candidates.length === 0) out.push('No pattern matched. This is not evidence that the dimension space is complete.', '')
  else {
    out.push('| Family | Dimension | Citation | Note |', '| --- | --- | --- | --- |')
    for (const entry of candidates) out.push(`| ${entry.family} | ${entry.dimension} | ${entry.citation} | ${entry.note} |`)
    out.push('')
  }
  out.push('## Side-effect inventory', '')
  if (effects.length === 0) out.push('No known side-effect token found.', '')
  else {
    out.push('| Category | Token | Citation |', '| --- | --- | --- |')
    for (const hit of effects) out.push(`| ${hit.category} | \`${hit.token}\` | code(${hit.path}#L${hit.line}) |`)
    out.push('')
  }
  return `${out.join('\n')}\n`
}

async function main() {
  const args = process.argv.slice(2)
  const paths = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--path' && args[index + 1] !== undefined) {
      paths.push(args[index + 1])
      index += 1
    } else {
      process.stderr.write(`USAGE: oracle-dimensions.mjs --path <file> [--path <file> ...]\n`)
      process.exitCode = 2
      return
    }
  }
  if (paths.length === 0) {
    process.stderr.write('USAGE: oracle-dimensions.mjs requires at least one --path\n')
    process.exitCode = 2
    return
  }

  const files = []
  for (const path of paths) {
    let content
    try {
      content = await readFile(path, 'utf8')
    } catch (error) {
      process.stderr.write(`SCAN_UNREADABLE: Cannot read ${path}: ${error.message}\n`)
      process.exitCode = 1
      return
    }
    files.push({ path, candidates: mineDimensions(path, content), effects: scanSideEffects(path, content).hits })
  }

  process.stdout.write(renderReport(files))
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) await main()

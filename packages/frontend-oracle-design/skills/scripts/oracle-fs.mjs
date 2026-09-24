import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

export const ZERO_DIGEST = '0'.repeat(64)

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry) ?? 'null').join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => [key, stableStringify(value[key])])
      .filter(([, serialized]) => serialized !== undefined)
      .map(([key, serialized]) => `${JSON.stringify(key)}:${serialized}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * 테스트·mock 경로 판정 — oracle-run의 TDD 순서 게이트와 PreToolUse hook이 같은 판정을 쓴다. 스크린샷·ARIA 기준선도
 * 기대값이다: VALID_RED에 얼리지 않으면 GREEN 직전에 기준선을 다시 찍어 통과시킬 수 있다.
 */
export const TEST_PATH_SEGMENTS = new Set(['__test__', '__tests__', '__mocks__', '__snapshots__', '__screenshots__'])

const TEST_FILE_NAME = /\.(?:test|spec)\.[a-z]+$|\.test-d\.tsx?$|\.snap$|\.aria\.yml$/

export function isTestPath(path) {
  const segments = path.split('/')
  const directories = segments.slice(0, -1)

  return (
    segments.some((segment) => TEST_PATH_SEGMENTS.has(segment)) ||
    // Playwright `<spec file>-snapshots/` 기준선 디렉터리 — 이름이 -snapshots로 끝나는 production 폴더는 아니다
    directories.some((segment) => /\.(?:test|spec)\.[cm]?[jt]sx?-snapshots$/.test(segment)) ||
    TEST_FILE_NAME.test(segments.at(-1))
  )
}

/**
 * 실패 원인 분류 — `$test` VALID_RED 술어 4의 기계 판정 가능한 부분만: reference 오류, 타임아웃, hook 실패는 하네스
 * 결함(`infra`)이다. 테스트 본문의 SyntaxError는 `JSON.parse`가 잘못된 응답에 던진 것일 수 있어(그 행의 위반 자체) 막지
 * 않는다 — 문법이 깨진 파일은 수집 단계에서 죽어 매핑 이름이 아예 없다. TypeError도 미구현 대상의 정상 RED
 * (`save is not a function`)일 수 있어 `other`다.
 */
export function failureCause(errorName, { timeout = false, hook = false } = {}) {
  if (timeout || hook || errorName === 'ReferenceError') return 'infra'
  if (errorName === 'AssertionError') return 'assertion'
  return 'other'
}

export const FAILURE_CAUSES = ['infra', 'assertion', 'other']

/** 컨트롤러가 findings에 덧붙이는 결속 필드 — 리뷰어가 낸 원문과 비교할 때 뺀다. */
const REVIEW_BINDING_FIELDS = new Set(['packetSha256', 'targetRevision'])

/**
 * 호스트 영수증이 묶는 리뷰어 산출물의 digest. findings 문서면 findings 배열을, 블라인드 매핑이면
 * `{ "<test name>": "O1" | ["O1"] }` 객체를 정규화해 해시한다. 둘 다 아니면 null — 영수증 대상이 아니다.
 */
export function reviewOutputDigest(document) {
  if (Array.isArray(document?.findings)) {
    const findings = document.findings.map((finding) =>
      Object.fromEntries(Object.entries(finding ?? {}).filter(([key]) => !REVIEW_BINDING_FIELDS.has(key))),
    )
    return { kind: 'findings', sha256: sha256(stableStringify(findings)) }
  }
  // 블라인드 매핑은 증거가 아닌 테스트를 null·[]로 둘 수 있다 — assertBlindMapping과 같은 모양
  const isRowList = (value) =>
    value === null || typeof value === 'string' || (Array.isArray(value) && value.every((row) => typeof row === 'string'))
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null
  const values = Object.values(document)
  if (values.length === 0 || !values.every(isRowList)) return null
  return { kind: 'blind-map', sha256: sha256(stableStringify(document)) }
}

export const HOST_RECEIPTS_FILE = 'host-receipts.jsonl'

/** 기존 테스트에서 새로 늘어나면 약화로 보는 토큰. 감소·유지는 통과한다. */
export const WEAKENING_TOKENS = [
  'test.skip',
  'it.skip',
  'describe.skip',
  '.only(',
  'waitForTimeout(',
  'toBeTruthy(',
  'toBeFalsy(',
  '.first()',
  '.nth(',
  'setTimeout(',
  'maxDiffPixels',
  'maxDiffPixelRatio',
  'threshold',
]

/**
 * 코드에서 기계적으로 뽑는 side-effect 토큰 표 — 알려진 목록일 뿐이며 검출 0은 효과 없음의 증거가 아니다.
 * `owned`는 카드 side-effect 열에서 그 범주를 소유한다고 볼 키워드다.
 */
export const SIDE_EFFECT_CATEGORIES = [
  { category: 'network', tokens: ['fetch(', 'axios.', 'axios(', 'ky.', 'ky(', 'XMLHttpRequest', 'graphql(', '.mutate(', 'useMutation('], owned: /GET|POST|PUT|PATCH|DELETE|request|fetch|요청|호출|save|저장|mutation/i },
  { category: 'storage', tokens: ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.'], owned: /storage|persist|cookie|cache|캐시|보존|저장소/i },
  { category: 'navigation', tokens: ['location.assign', 'location.replace', 'location.href', 'history.push', 'history.replace', 'router.push', 'router.replace', 'navigate(', 'window.open('], owned: /navigat|route|URL|redirect|이동|라우트|history|open/i },
  { category: 'messaging', tokens: ['postMessage(', 'BroadcastChannel', 'dispatchEvent(', 'new CustomEvent'], owned: /message|event|메시지|이벤트|broadcast|dispatch/i },
  { category: 'analytics', tokens: ['track(', 'gtag(', 'analytics.', 'dataLayer', 'sendBeacon('], owned: /analytics|track|telemetry|이벤트|분석|로그|log/i },
  { category: 'timer', tokens: ['setTimeout(', 'setInterval(', 'requestAnimationFrame(', 'requestIdleCallback('], owned: /timer|타이머|debounce|throttle|delay|interval|지연/i },
  { category: 'subscription', tokens: ['addEventListener(', '.observe(', '.subscribe(', 'new ResizeObserver', 'new IntersectionObserver', 'new MutationObserver'], owned: /listener|subscri|observ|구독|관측/i },
  { category: 'console', tokens: ['console.log(', 'console.warn(', 'console.error(', 'console.info('], owned: /console|log|로그/i },
  { category: 'notification', tokens: ['new Notification(', 'navigator.clipboard', 'navigator.share(', 'navigator.vibrate('], owned: /notification|clipboard|share|알림|클립보드|공유/i },
]

export const SIDE_EFFECT_EXEMPTION_MARKER = 'oracle:side-effect'

const EXEMPTION_PATTERN = new RegExp(`${SIDE_EFFECT_EXEMPTION_MARKER}[ \\t]+(\\S[^\\n]*)`)

/**
 * 주어진 파일 내용에서 side-effect 토큰을 줄 단위로 찾는다. 면제 주석 `oracle:side-effect <row|reason>`은 같은 줄이나
 * 바로 윗줄이며 **사유가 있어야** 면제다 — 맨 마커는 면제하지 않고 `invalid`로 돌려준다.
 */
export function scanSideEffects(path, content) {
  const lines = content.split('\n')
  const hits = []
  const exemptions = []
  const invalid = []

  const exemptionOf = (line, lineNumber) => {
    if (!line.includes(SIDE_EFFECT_EXEMPTION_MARKER)) return null
    const match = line.match(EXEMPTION_PATTERN)
    if (!match) {
      invalid.push({ path, line: lineNumber, reason: 'marker without a row or reason' })
      return null
    }
    return { path, line: lineNumber, reason: match[1].replace(/\*\/\s*$/, '').trim() }
  }

  lines.forEach((line, index) => {
    const exemption = exemptionOf(line, index + 1) ?? exemptionOf(lines[index - 1] ?? '', index)
    if (exemption) {
      if (!exemptions.some((entry) => entry.line === exemption.line)) exemptions.push(exemption)
      return
    }

    for (const { category, tokens } of SIDE_EFFECT_CATEGORIES) {
      for (const token of tokens) {
        if (line.includes(token)) hits.push({ path, line: index + 1, token, category })
      }
    }
  })

  return { hits, exemptions, invalid }
}

export function isPathInside(base, target) {
  const path = relative(resolve(base), resolve(target))
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function reject(options, message, cause) {
  const error = options.fail ? options.fail(message) : new Error(message)
  if (cause !== undefined && error.cause === undefined) error.cause = cause
  throw error
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
}

async function pathState(path, options) {
  try {
    return await lstat(path)
  } catch (error) {
    return reject(options, `${options.label}: cannot stat ${path}: ${error.message}`, error)
  }
}

export async function snapshotRegularFile(path, options = {}) {
  const target = resolve(path)
  const settings = { allowHardlinks: true, label: 'file', ...options }
  const before = await pathState(target, settings)
  if (before.isSymbolicLink() || !before.isFile()) {
    reject(settings, `${settings.label}: ${target} must be a regular non-symlink file`)
  }
  if (!settings.allowHardlinks && before.nlink !== 1) {
    reject(settings, `${settings.label}: ${target} must not have hardlink aliases`)
  }

  let realBase = null
  let realTarget
  try {
    ;[realBase, realTarget] = await Promise.all([
      settings.base ? realpath(resolve(settings.base)) : Promise.resolve(null),
      realpath(target),
    ])
  } catch (error) {
    reject(settings, `${settings.label}: cannot resolve ${target}: ${error.message}`, error)
  }
  if (realBase && !isPathInside(realBase, realTarget)) {
    reject(settings, `${settings.label}: ${target} must stay inside ${realBase}`)
  }

  let handle
  try {
    handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  } catch (error) {
    reject(settings, `${settings.label}: cannot open ${target} without following links: ${error.message}`, error)
  }

  try {
    const opened = await handle.stat()
    if (!opened.isFile() || !sameIdentity(before, opened)) {
      reject(settings, `${settings.label}: ${target} changed while it was opened`)
    }
    if (!settings.allowHardlinks && opened.nlink !== 1) {
      reject(settings, `${settings.label}: ${target} gained hardlink aliases while it was opened`)
    }
    const bytes = await handle.readFile()
    const afterRead = await handle.stat()
    if (!sameIdentity(opened, afterRead)) {
      reject(settings, `${settings.label}: ${target} changed while it was read`)
    }
    if (!settings.allowHardlinks && afterRead.nlink !== 1) {
      reject(settings, `${settings.label}: ${target} gained hardlink aliases while it was read`)
    }
    const [afterPath, finalRealTarget] = await Promise.all([stat(target), realpath(target)])
    if (!sameIdentity(opened, afterPath) || finalRealTarget !== realTarget) {
      reject(settings, `${settings.label}: ${target} changed during verification`)
    }
    if (!settings.allowHardlinks && afterPath.nlink !== 1) {
      reject(settings, `${settings.label}: ${target} gained hardlink aliases during verification`)
    }
    return {
      path: target,
      realPath: realTarget,
      bytes,
      sha256: sha256(bytes),
      size: opened.size,
      dev: opened.dev,
      ino: opened.ino,
      nlink: opened.nlink,
    }
  } finally {
    await handle.close()
  }
}

export async function assertSnapshotUnchanged(snapshot, options = {}) {
  const current = await snapshotRegularFile(snapshot.path, {
    allowHardlinks: options.allowHardlinks ?? false,
    label: options.label ?? 'file',
    base: options.base,
    fail: options.fail,
  })
  if (
    current.realPath !== snapshot.realPath ||
    current.dev !== snapshot.dev ||
    current.ino !== snapshot.ino ||
    current.size !== snapshot.size ||
    current.sha256 !== snapshot.sha256
  ) {
    reject(options, `${options.label ?? 'file'}: ${snapshot.path} changed during verification`)
  }
  return current
}

export async function pathsShareIdentity(left, right) {
  try {
    const [leftStat, rightStat] = await Promise.all([stat(resolve(left)), stat(resolve(right))])
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

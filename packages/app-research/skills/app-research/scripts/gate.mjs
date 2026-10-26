import { join } from 'node:path'
import { actionKey, normalizeText } from './fingerprint.mjs'
import { assertConsistent, currentScreen, FILES, loadRun, pendingGate, usedActions } from './state.mjs'
import { appendJsonl, pad, withRunLock } from './store.mjs'

export const ACTIONS = ['tap', 'longpress', 'type', 'swipe', 'scroll', 'back', 'home', 'open']
const TARGET_ACTIONS = new Set(['tap', 'longpress', 'type'])
const NEVER_CLASSIFIED = new Set(['back', 'home', 'scroll'])

// A lexical safety net over the visible label, the control id and the dialog text (Korean and English), not a
// guarantee: the agent still judges every action. Korean terms match as substrings of the label with every
// non-letter removed; `a+b` needs both parts. English terms match whole words: `pay*` is a prefix, `a b` a
// phrase, `a+b` needs both words anywhere. Labels that only open a screen (payment methods, history) are
// exempted per rule by `unless`.
const RULES = [
  {
    category: 'account-deletion',
    humanAction: 'Account closure is never automated; confirm manually if it must be studied.',
    ko: ['탈퇴', '계정+삭제', '계정+해지', '계정+폐쇄', '계정+비활성', '회원+삭제', '프로필+삭제'],
    en: [
      'deactivat*',
      'delet*+account',
      'delet*+profile',
      'close+account',
      'remov*+account',
      'terminat*+account',
      'withdraw+membership',
      'cancel+membership',
    ],
  },
  {
    category: 'payment',
    humanAction: 'Complete or skip this purchase or transfer yourself; the research run never moves money.',
    price: true,
    unless: {
      ko: ['수단', '내역', '방법', '관리', '설정', '정보', '목록', '영수증', '안내'],
      en: [
        'method',
        'methods',
        'history',
        'settings',
        'manage',
        'details',
        'info',
        'options',
        'receipts',
        'preferences',
      ],
    },
    ko: [
      '결제',
      '지불',
      '구매',
      '주문',
      '송금',
      '이체',
      '출금',
      '입금',
      '매수',
      '매도',
      '선물',
      '충전',
      '후원',
      '구독하기',
      '구독시작',
      '구독신청',
      '업그레이드',
      '유료전환',
      '무료체험',
      '무료로시작',
      '프리미엄시작',
    ],
    en: [
      'pay*',
      'purchas*',
      'buy',
      'bought',
      'order',
      'book',
      'reserve',
      'subscribe',
      'upgrade',
      'donate',
      'checkout',
      'check out',
      'transfer',
      'withdraw',
      'charge',
      'trial',
      'try free',
      'get premium',
      'go premium',
      'get pro',
      'go pro',
      'unlock',
      'top up',
      'add funds',
      'send money',
      'wire',
    ],
  },
  {
    category: 'legal-consent',
    humanAction: 'A person must give or decline this consent; record what the screen asks for instead.',
    ko: ['동의', '수락', '전자서명'],
    en: ['agree', 'accept', 'consent', 'allow+cookies', 'allow+all'],
  },
  {
    category: 'outbound-message',
    humanAction:
      'A real message, post, review or report would be sent; send it yourself from a test account if it must be observed.',
    ko: ['전송', '보내기', '발송', '게시하기', '등록', '신고', '리뷰작성', '리뷰남기기'],
    en: ['send', 'post', 'publish', 'reply', 'comment', 'submit', 'report', 'write+review', 'leave+review'],
  },
  {
    category: 'external-transfer',
    humanAction: 'Data would leave the app (share, upload, contacts, invites); handle it manually.',
    ko: ['공유', '초대', '업로드', '내보내기', '연락처+동기화', '연락처+가져오기'],
    en: ['share', 'invite', 'upload', 'export', 'import+contacts', 'sync+contacts'],
  },
  {
    category: 'session-end',
    humanAction: 'Signing out ends the prepared test session; sign in again before continuing.',
    ko: ['로그아웃', '계정전환'],
    en: ['logout', 'log out', 'signout', 'sign out', 'switch account'],
  },
  {
    category: 'destructive',
    humanAction: 'Confirm manually that this deletes or resets nothing real before it is explored.',
    ko: ['삭제', '제거', '초기화', '비우기', '해지'],
    en: [
      'delet*',
      'remov*',
      'eras*',
      'reset',
      'clear all',
      'cancel order',
      'cancel subscription',
      'cancel booking',
      'unsubscribe',
    ],
  },
]

// Stems that identify an icon-only control by its id (`PURCHASEBTN`, `checkoutButton`, `delete_account_btn`).
const ID_STEMS = {
  purchase: 'payment',
  checkout: 'payment',
  payment: 'payment',
  subscribe: 'payment',
  upgrade: 'payment',
  donate: 'payment',
  withdraw: 'payment',
  transfer: 'payment',
  deleteaccount: 'account-deletion',
  closeaccount: 'account-deletion',
  deactivate: 'account-deletion',
  logout: 'session-end',
  signout: 'session-end',
  submit: 'outbound-message',
  delete: 'destructive',
}

const CREDENTIAL = {
  ko: [
    '비밀번호',
    '패스워드',
    '암호',
    '인증',
    '보안코드',
    '카드번호',
    '계좌번호',
    '주민등록번호',
    '이메일',
    '아이디',
    '휴대폰',
    '전화번호',
  ],
  en: [
    'password',
    'passcode',
    'pw',
    'pwd',
    'passwd',
    'pin',
    'otp',
    'cvc',
    'cvv',
    'ssn',
    'email',
    'e mail',
    'username',
    'user id',
    'login id',
    'phone',
    'verification code',
    'security code',
    'auth code',
    'sms code',
    'card number',
    'enter code',
  ],
}
const PRICE = [/[$£¥₩€₹]\s?\d/, /\d\s?[$£¥₩€₹]/, /\d\s?(?:[만천]?원|달러|eur|inr|krw|usd)/]
const SAFE_DECLINE = new Set([
  'cancel',
  'close',
  'no',
  'back',
  'dismiss',
  'skip',
  'later',
  'not now',
  'no thanks',
  '취소',
  '닫기',
  '아니요',
  '아니오',
  '나중에',
  '건너뛰기',
  '뒤로',
])
const CONFIRM_FIRST = new Set([
  'ok',
  'okay',
  'yes',
  'sure',
  'confirm',
  'continue',
  'proceed',
  'done',
  'apply',
  'understand',
  'got',
  '확인',
  '예',
  '네',
  '계속',
  '다음',
  '완료',
  '적용',
])
const GENERIC_ID = /^(?:button|btn|view|item|image|imageview|textview|layout|container|icon)[\d_]*$/
const CONFUSABLES = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ѕ: 's',
  ο: 'o',
  α: 'a',
  ν: 'v',
}

/** Lowercase, NFKC, no invisible format characters, common look-alike letters folded to Latin. */
const fold = (value) =>
  normalizeText(String(value ?? '').replaceAll(/\p{Cf}/gu, '')).replaceAll(
    /[\p{Script=Greek}\p{Script=Cyrillic}]/gu,
    (char) => CONFUSABLES[char] ?? char,
  )

const tokensOf = (text) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const compactOf = (text) => text.replaceAll(/[^\p{L}\p{N}]/gu, '')

function englishMatch(term, tokens) {
  if (term.includes('+')) return term.split('+').every((part) => englishMatch(part, tokens))
  if (term.endsWith('*')) return tokens.some((token) => token.startsWith(term.slice(0, -1)))
  return ` ${tokens.join(' ')} `.includes(` ${term} `)
}

function koreanMatch(term, compact) {
  return term.split('+').every((part) => compact.includes(part))
}

function mentions(terms, text) {
  const tokens = tokensOf(text)
  const compact = compactOf(text)
  return terms.ko.some((term) => koreanMatch(term, compact)) || terms.en.some((term) => englishMatch(term, tokens))
}

// Only the control's own words can exempt it (`unless`); dialog text or id words must never cancel a match.
// A price is checked on everything, exempt or not.
const ruleMatches = (rule, own, subject) => {
  if (rule.price && PRICE.some((pattern) => pattern.test(subject))) return true
  if (rule.unless && mentions(rule.unless, own)) return false
  return mentions(rule, subject)
}

// A decline label cancels nothing, unless the id or the dialog says it cancels an order, a plan or an account.
const CANCELLATION = {
  ko: ['취소+주문', '취소+구독', '취소+예약', '취소+멤버십', '해지+구독', '해지+멤버십', '해지+계정'],
  en: [
    'cancel*+order*',
    'cancel*+subscription*',
    'cancel*+booking*',
    'cancel*+reservation*',
    'cancel*+membership*',
    'cancel*+account*',
    'cancel*+plan*',
  ],
}

function idWordsOf(id) {
  return fold(
    String(id)
      .replaceAll(/([\d\p{Ll}])(\p{Lu})/gu, '$1 $2')
      .replaceAll(/[#./:_-]+/g, ' '),
  )
}

function idStemCategory(id) {
  const compact = compactOf(fold(id))
  return Object.entries(ID_STEMS).find(([stem]) => compact.includes(stem))?.[1]
}

const isGenericId = (id) => GENERIC_ID.test(fold(String(id).split('/').at(-1)))

function isConfirmatory(text, words) {
  if (!text) return tokensOf(words).some((token) => CONFIRM_FIRST.has(token))
  const tokens = tokensOf(text)
  const phrase = tokens.join(' ')
  return (
    CONFIRM_FIRST.has(tokens[0] ?? '') ||
    phrase.startsWith('i understand') ||
    phrase.startsWith('i am sure') ||
    compactOf(text).startsWith('확인')
  )
}

const blockedBy = (category, humanAction, reason) => ({ category, humanAction, reason })

const isDecline = (text) => SAFE_DECLINE.has(tokensOf(text).join(' '))

/** A decline label stays safe only while its id and the dialog do not point at a commit. */
function declineIsSafe({ words, id, dialog }) {
  if (idStemCategory(id) || mentions(CANCELLATION, `${words} ${dialog}`)) return false
  return !RULES.some((rule) => ruleMatches(rule, words, words))
}

function identifyTarget({ action, text, id, words }) {
  if (!TARGET_ACTIONS.has(action)) return null
  const named = /[\p{L}\p{N}]/u.test(text)
  if (named || (words && !isGenericId(id))) return null
  return blockedBy(
    'unidentified-target',
    null,
    'The target has no readable label or id; identify it from the snapshot before acting.',
  )
}

function credentialRule({ action, role, label, id, text, words }) {
  if (action !== 'type') return null
  const secureRole = /secure|password/.test(fold(role))
  if (!secureRole && !mentions(CREDENTIAL, `${text} ${words}`)) return null
  return blockedBy(
    'credential-entry',
    'Credentials come only from the session a person prepared; the agent never types them.',
    `Typing into "${label || id}" is credential entry.`,
  )
}

/** Returns the blocking rule for an action, or null when the content rules allow it. */
export function classify({ action, label = '', id = '', role = '', context = '' }) {
  if (NEVER_CLASSIFIED.has(action)) return null
  const text = fold(label)
  const words = idWordsOf(id)
  if (!text && !words && !TARGET_ACTIONS.has(action)) return null
  const problem =
    identifyTarget({ action, text, id, words }) ?? credentialRule({ action, role, label, id, text, words })
  if (problem) return problem
  const dialog = fold(context)
  const decline = isDecline(text)
  if (decline && declineIsSafe({ words, id, dialog })) return null
  const subject = `${text} ${words} ${dialog}`
  const own = text || words
  const category =
    RULES.find((candidate) => ruleMatches(candidate, own, subject))?.category ??
    idStemCategory(id) ??
    (decline ? 'destructive' : undefined)
  if (!category) {
    if (!isConfirmatory(text, words) || dialog) return null
    return blockedBy(
      'context-required',
      null,
      `"${label || id}" only confirms something; pass --context with the dialog text so its meaning can be checked.`,
    )
  }
  const humanAction = RULES.find((candidate) => candidate.category === category).humanAction
  return blockedBy(category, humanAction, `"${label || id}" matches the ${category} rule.`)
}

function resolveTarget(screen, { action, label, id, role }) {
  if (!TARGET_ACTIONS.has(action)) return { label, id, role: role ?? '', key: actionKey(action, role, id, label) }
  const wanted = action === 'type' ? 'type' : 'tap'
  let pool = screen.candidates.filter((candidate) => candidate.action === wanted)
  pool = id
    ? pool.filter((candidate) => fold(candidate.id) === fold(id))
    : pool.filter((candidate) => fold(candidate.label) === fold(label))
  if (role) pool = pool.filter((candidate) => fold(candidate.role) === fold(role))
  if (pool.length === 1) {
    const [found] = pool
    return {
      label: found.label,
      id: found.id,
      role: found.role,
      key: actionKey(action, found.role, found.id, found.label),
    }
  }
  const problem = pool.length === 0 ? 'unknown-target' : 'ambiguous-target'
  const reason =
    pool.length === 0 ? 'is not an action on the current screen' : 'matches several controls; add --role or --id'
  return { problem: blockedBy(problem, null, `"${label || id}" ${reason}.`) }
}

/** Limit checks shared with `next`, which skips route steps the gate would refuse. */
export function limitVerdict(state, screen, action, key, used) {
  const { run } = state
  if (used >= run.maxActions) return { category: 'budget', reason: `Action budget ${run.maxActions} is spent.` }
  if (action === 'back' || action === 'home') return null
  if (screen.depth >= run.maxDepth)
    return { category: 'depth-limit', reason: `${screen.id} is at the depth limit ${run.maxDepth}.` }
  const visits = state.observations.filter((observation) => observation.screenId === screen.id).length
  if (visits > run.maxVisitsPerScreen)
    return { category: 'visit-limit', reason: `${screen.id} was visited ${visits} times.` }
  const repeats = state.gates.filter(
    (gate) => gate.decision === 'allow' && gate.screenId === screen.id && gate.actionKey === key,
  ).length
  if (repeats >= run.maxRepeatPerAction)
    return { category: 'repeat-limit', reason: `${key} already ran ${repeats} times on ${screen.id}.` }
  return null
}

async function issue(runDir, input) {
  const state = await loadRun(runDir)
  const { run } = state
  if (run.mode !== 'interactive') throw new Error(`Mode ${run.mode} has no device actions; gate is not used.`)
  assertConsistent(state)
  if (!ACTIONS.includes(input.action)) throw new Error(`--action must be one of ${ACTIONS.join(', ')}`)
  const screen = currentScreen(state)
  const { action } = input
  const asked = {
    action,
    label: input.label === undefined ? '' : String(input.label),
    id: input.id === undefined ? '' : String(input.id),
    role: input.role,
  }
  const target = resolveTarget(screen, asked)
  const content =
    target.problem ??
    classify({ action, label: target.label, id: target.id, role: target.role, context: input.context })
  // Replacing an unobserved receipt abandons it, and an abandoned receipt still spent an action.
  const used = usedActions(state) + (pendingGate(state) ? 1 : 0)
  const blocker = content ?? limitVerdict(state, screen, action, target.key, used)
  // A target that could not be resolved is recorded as the agent named it.
  const named = target.problem
    ? {
        label: asked.label,
        id: asked.id,
        role: asked.role ?? '',
        key: actionKey(action, asked.role, asked.id, asked.label),
      }
    : target
  const record = {
    kind: 'gate',
    gateId: `G-${pad(state.gates.length + 1, 4)}`,
    at: new Date().toISOString(),
    screenId: screen.id,
    action,
    label: named.label,
    role: named.role,
    id: named.id,
    actionKey: named.key,
    decision: blocker ? 'blocked' : 'allow',
    ...(blocker && { category: blocker.category, reason: blocker.reason, humanAction: blocker.humanAction ?? null }),
  }
  await appendJsonl(join(state.dir, FILES.gates), record)
  const { kind: _kind, ...receipt } = record
  return { ...receipt, budget: { used, max: run.maxActions } }
}

export const gate = (runDir, input) => withRunLock(runDir, () => issue(runDir, input))

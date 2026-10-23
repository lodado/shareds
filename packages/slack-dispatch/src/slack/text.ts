// Slack message text as people wrote it (mrkdwn with <@U123>, <#C1|name>, <https://x|label>) turned into plain
// text, plus the facts the routing rules read from it. Pure functions only.

const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>' }

const decodeEntities = (text: string): string =>
  text.replaceAll(/&(?:amp|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity)

const BRACKETED = /<([^<>]+)>/g

// <@U1> -> @user, <#C1|dev> -> #dev, <!here> -> @here, <https://x|label> -> label, <https://x> -> https://x
function plainBracket(inner: string): string {
  const [target = '', label] = inner.split('|')
  if (target.startsWith('@')) return label ?? '@user'
  if (target.startsWith('#')) return label === undefined ? '#channel' : `#${label}`
  if (target.startsWith('!')) {
    const name = label ?? target.slice(1).split('^')[0] ?? 'here'
    return name.startsWith('@') ? name : `@${name}`
  }
  return label ?? target
}

export function cleanSlackText(text: string): string {
  return decodeEntities(text.replaceAll(BRACKETED, (_whole, inner: string) => plainBracket(inner)))
    .replaceAll(/\s+/g, ' ')
    .trim()
}

const URL_IN_TEXT = /https?:\/\/[^\s<>|)"']+/g

const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':'])

// A link at the end of a sentence does not own the full stop.
function withoutTrailingPunctuation(url: string): string {
  let end = url.length
  while (end > 0 && TRAILING_PUNCTUATION.has(url.charAt(end - 1))) end -= 1
  return url.slice(0, end)
}

// Every link in a message, whether it was written as <url|label> or as a bare URL. Order is kept, repeats are not.
export function extractLinks(text: string): string[] {
  const urls = [...decodeEntities(text).matchAll(URL_IN_TEXT)].map((match) => withoutTrailingPunctuation(match[0]))
  return [...new Set(urls)]
}

function githubRepoOf(link: string): string | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (url.hostname.toLowerCase() !== 'github.com') return null
  const repo = url.pathname.split('/')[2]
  return repo ? repo.replace(/\.git$/i, '') : null
}

// The repo names that GitHub links point to (owner dropped, `.git` dropped), in order, without repeats.
export function githubRepoNames(links: readonly string[]): string[] {
  const names = links.map(githubRepoOf).filter((name): name is string => name !== null)
  return [...new Set(names)]
}

const URGENT = /장애|긴급|서비스\s*다운|롤백|배포\s*실패|\burgent\b|\bP0\b|\bincident\b|\boutage\b|\brollback\b/i

export const looksUrgent = (text: string): boolean => URGENT.test(text)

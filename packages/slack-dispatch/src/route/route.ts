// Which repo a thread is about, decided by rules the owner can read. The answer is a suggestion with its reason; the
// owner still approves it in the digest. Pure functions only.

import { githubRepoNames } from '../slack/text.ts'

export interface RouteInput {
  text: string
  links: readonly string[]
  channelName?: string
}

export interface RouteConfig {
  // Names of the repos that exist on this machine (from Orca).
  knownRepos: readonly string[]
  // Which repos a channel is about, from the owner's private routes file.
  channelRepos?: Readonly<Record<string, readonly string[]>>
}

export interface RouteResult {
  // null when no rule found a repo
  repo: string | null
  // true only when exactly one rule named exactly one repo
  confident: boolean
  reason: string
}

// Shorter names ("docs", "api") appear in ordinary sentences, so they are not matched in free text.
const MIN_NAME_LENGTH_IN_TEXT = 5

const escapeRegex = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

// In the order they first appear in the text, so the one mentioned first is the one suggested.
function reposNamedInText(text: string, knownRepos: readonly string[]): string[] {
  const found = knownRepos.flatMap((repo) => {
    if (repo.length < MIN_NAME_LENGTH_IN_TEXT) return []
    const at = text.search(new RegExp(`(?<![\\w-])${escapeRegex(repo)}(?![\\w-])`, 'i'))
    return at < 0 ? [] : [{ repo, at }]
  })
  return found.toSorted((a, b) => a.at - b.at).map((entry) => entry.repo)
}

// The known repos for these names, in the order the names were given.
function byCaseInsensitiveName(names: readonly string[], knownRepos: readonly string[]): string[] {
  const lookup = new Map(knownRepos.map((repo) => [repo.toLowerCase(), repo]))
  const repos = names.flatMap((name) => lookup.get(name.toLowerCase()) ?? [])
  return [...new Set(repos)]
}

function channelReposFor(input: RouteInput, config: RouteConfig): string[] {
  const { channelName } = input
  const table = config.channelRepos ?? {}
  if (channelName === undefined || !Object.hasOwn(table, channelName)) return []
  return (table[channelName] ?? []).filter((repo) => config.knownRepos.includes(repo))
}

// One repo found: sure. Several found: the first is only suggested. None: this rule has nothing to say.
function decided(repos: readonly string[], found: string, ambiguous: string): RouteResult | null {
  const [first] = repos
  if (first === undefined) return null
  if (repos.length === 1) return { repo: first, confident: true, reason: `${found}: ${first}` }
  return { repo: first, confident: false, reason: `${ambiguous}: ${repos.join(', ')}` }
}

// Rules, strongest first: a GitHub link, a repo name in the text, the channel's repos. The first rule that finds
// anything decides.
export function routeThread(input: RouteInput, config: RouteConfig): RouteResult {
  const fromLinks = byCaseInsensitiveName(githubRepoNames(input.links), config.knownRepos)
  const linked = decided(fromLinks, 'GitHub 링크가 가리키는 레포', 'GitHub 링크가 여러 레포를 가리킴')
  if (linked) return linked

  const named = decided(
    reposNamedInText(input.text, config.knownRepos),
    '본문에 레포 이름이 나옴',
    '본문에 여러 레포 이름이 나옴',
  )
  if (named) return named

  const channel = `#${input.channelName ?? ''}`
  const fromChannel = decided(
    channelReposFor(input, config),
    `채널 ${channel}의 담당 레포`,
    `채널 ${channel}의 담당 레포가 여러 개`,
  )
  if (fromChannel) return fromChannel

  return { repo: null, confident: false, reason: '레포를 정할 단서가 없음' }
}

import { describe, expect, it } from 'vitest'
import { claudeEnv, repoCodeEnv } from './env'

const SIGN_IN = ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR']
const NEEDED = [
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'TMPDIR',
  'HTTPS_PROXY',
  'https_proxy',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
]
const SECRETS = [
  'SLACK_BOT_TOKEN',
  'SLACK_USER_TOKEN',
  'SLACK_APP_TOKEN',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'AWS_SECRET_ACCESS_KEY',
  'NPM_TOKEN',
  'OPENAI_API_KEY',
  'NODE_OPTIONS',
  '',
]

describe('repoCodeEnv as what a repository program may see', () => {
  it.each(NEEDED)('to be given %s, which a program needs to run', (name) => {
    expect(repoCodeEnv(name)).toBe(true)
  })

  it.each(SIGN_IN)('to be without %s: no repository program gets how claude signs in', (name) => {
    expect(repoCodeEnv(name)).toBe(false)
  })

  it.each(SECRETS)('to be without %j', (name) => {
    expect(repoCodeEnv(name)).toBe(false)
  })
})

describe('claudeEnv as what the claude program may see', () => {
  it.each([...NEEDED, ...SIGN_IN])('to be given %s', (name) => {
    expect(claudeEnv(name)).toBe(true)
  })

  it.each(SECRETS)('to be without %j: not even claude sees the service own tokens', (name) => {
    expect(claudeEnv(name)).toBe(false)
  })
})

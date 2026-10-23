import { describe, expect, it } from 'vitest'
import { programEnv } from './env'

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
const SIGN_IN = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CONFIG_DIR',
  'SLACK_BOT_TOKEN',
  'SLACK_USER_TOKEN',
  'SLACK_APP_TOKEN',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'AWS_SECRET_ACCESS_KEY',
  'NPM_TOKEN',
  'OPENAI_API_KEY',
]
const NOT_THEIRS = [
  'NODE_OPTIONS',
  'ANTHROPIC_MODEL',
  'CLAUDECODE',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_ENTRYPOINT',
  '',
]

describe('programEnv as what a program the service starts may see', () => {
  it.each(NEEDED)('to be given %s, which a program needs to run', (name) => {
    expect(programEnv(name)).toBe(true)
  })

  it.each(SIGN_IN)('to be without %s: nothing that signs in anywhere, claude included', (name) => {
    expect(programEnv(name)).toBe(false)
  })

  it.each(NOT_THEIRS)(
    'to be without %j: not a setting of this service session, and no way to make a child think it is one',
    (name) => {
      expect(programEnv(name)).toBe(false)
    },
  )
})

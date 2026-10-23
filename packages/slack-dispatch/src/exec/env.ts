// Which of the service's environment variables the agent, and any repository code it or the service starts, may see.
// Repository code (installing packages, a dev server, a browser run) gets only what a program needs to work. Nothing
// that signs in anywhere: not Slack, not GitHub, not a cloud, and not claude. Everything else the service has stays out
// of reach.
const BASE_ENV: ReadonlySet<string> = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TERM',
  'TZ',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
])

// How claude itself signs in, when it does not use the keychain. Only the claude process gets these.
const SIGN_IN_ENV: ReadonlySet<string> = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CONFIG_DIR',
])

export const repoCodeEnv = (name: string): boolean => BASE_ENV.has(name)

export const claudeEnv = (name: string): boolean => BASE_ENV.has(name) || SIGN_IN_ENV.has(name)

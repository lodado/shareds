// Which of the service's environment variables the agent, and any repository code it or the service starts, may see.

// The agent, and the repository code it runs, get only the environment they need to work and to sign in to claude.
// Everything else the service has (a GitHub or cloud token, say) stays out of reach.
const AGENT_ENV: ReadonlySet<string> = new Set([
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
  // How claude itself signs in, when it is not the keychain.
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CONFIG_DIR',
])

export const agentEnv = (name: string): boolean => AGENT_ENV.has(name)

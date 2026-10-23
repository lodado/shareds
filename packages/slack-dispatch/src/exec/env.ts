// Which of the service's environment variables a program it starts may see: the agent, and any repository code.
// A program gets only what it needs to work. Nothing that signs in anywhere: not Slack, not GitHub, not a cloud, and not
// claude, which uses the login of the claude installed on this machine (the keychain, found through HOME). Everything
// else the service has stays out of reach.
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

export const programEnv = (name: string): boolean => BASE_ENV.has(name)

// What it takes to have macOS start the service by itself when the owner logs in: the LaunchAgent file, and the PATH it
// needs, because a program started by launchd gets almost none and the service starts claude, orca, gh, git and pnpm.
// Pure functions only; scripts/service.ts does the writing and the launchctl calls.

import { delimiter, dirname, join } from 'node:path'

export interface PlistInput {
  label: string
  // Absolute path of the node that runs the service.
  node: string
  // The package folder: the working folder, so `.env` and `scripts/dispatch.ts` are found.
  packageDir: string
  logPath: string
  path: string
  home: string
}

// The programs the service starts, besides node itself.
export const REQUIRED_PROGRAMS = ['node', 'pnpm', 'claude', 'orca', 'gh', 'git', 'security'] as const

const SYSTEM_DIRS = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

const escapeXml = (text: string): string => text.replaceAll(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char)

// com.<user>.slack-dispatch, like the other agents of the same user; only characters a label may hold.
export function labelFor(user: string): string {
  const safe = user.replaceAll(/[^\w.-]/g, '-')
  return `com.${safe === '' ? 'user' : safe}.slack-dispatch`
}

export function findOnPath(name: string, pathVariable: string, exists: (file: string) => boolean): string | undefined {
  for (const dir of pathVariable.split(delimiter)) {
    if (dir === '') continue
    const candidate = join(dir, name)
    if (exists(candidate)) return candidate
  }
  return undefined
}

// The folders of the programs that were found, each once, then the system folders.
export function servicePath(found: readonly string[]): string {
  const dirs = [...found.map((file) => dirname(file)), ...SYSTEM_DIRS]
  return [...new Set(dirs)].join(delimiter)
}

function entry(key: string, value: string): string {
  return `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`
}

export function renderPlist(input: PlistInput): string {
  const args = [input.node, '--env-file-if-exists=.env', '--no-warnings', 'scripts/dispatch.ts']
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key>\n  <string>${escapeXml(input.label)}</string>`,
    `  <key>ProgramArguments</key>\n  <array>\n${args
      .map((arg) => `    <string>${escapeXml(arg)}</string>`)
      .join('\n')}\n  </array>`,
    `  <key>WorkingDirectory</key>\n  <string>${escapeXml(input.packageDir)}</string>`,
    '  <key>EnvironmentVariables</key>\n  <dict>',
    entry('PATH', input.path),
    entry('HOME', input.home),
    '  </dict>',
    // Started when the owner logs in, and again after a crash, but not after a clean stop.
    '  <key>RunAtLoad</key>\n  <true/>',
    '  <key>KeepAlive</key>\n  <dict>\n    <key>SuccessfulExit</key>\n    <false/>\n  </dict>',
    // A service that cannot start (Orca not open yet, say) is tried again every half minute, not in a tight loop.
    '  <key>ThrottleInterval</key>\n  <integer>30</integer>',
    // The keychain, where the tokens and the claude login are, is only reachable from the owner\'s own session.
    '  <key>LimitLoadToSessionType</key>\n  <string>Aqua</string>',
    '  <key>ProcessType</key>\n  <string>Background</string>',
    `  <key>StandardOutPath</key>\n  <string>${escapeXml(input.logPath)}</string>`,
    `  <key>StandardErrorPath</key>\n  <string>${escapeXml(input.logPath)}</string>`,
    '</dict>',
    '</plist>',
  ]
  return `${lines.join('\n')}\n`
}

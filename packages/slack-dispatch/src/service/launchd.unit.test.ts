import { describe, expect, it } from 'vitest'
import { findOnPath, labelFor, renderPlist, REQUIRED_PROGRAMS, servicePath } from './launchd'

const input = {
  label: 'com.me.slack-dispatch',
  node: '/Users/me/.nvm/versions/node/v26.7.0/bin/node',
  packageDir: '/Users/me/work/shareds/packages/slack-dispatch',
  logPath: '/Users/me/.slack-dispatch/service.log',
  path: '/opt/homebrew/bin:/usr/bin',
  home: '/Users/me',
}

describe('renderPlist as the file that makes macOS start the service', () => {
  const plist = renderPlist(input)

  it('to be a property list that names the job and how to start it, from the package folder', () => {
    expect(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist')).toBe(true)
    expect(plist).toContain('<key>Label</key>\n  <string>com.me.slack-dispatch</string>')
    expect(plist).toContain(
      [
        '<array>',
        '    <string>/Users/me/.nvm/versions/node/v26.7.0/bin/node</string>',
        '    <string>--env-file-if-exists=.env</string>',
        '    <string>--no-warnings</string>',
        '    <string>scripts/dispatch.ts</string>',
        '  </array>',
      ].join('\n'),
    )
    expect(plist).toContain(
      '<key>WorkingDirectory</key>\n  <string>/Users/me/work/shareds/packages/slack-dispatch</string>',
    )
  })

  it('to be started at login, and again after a crash but not after a clean stop', () => {
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>')
    expect(plist).toContain('<key>KeepAlive</key>\n  <dict>\n    <key>SuccessfulExit</key>\n    <false/>\n  </dict>')
    expect(plist).toContain('<key>ThrottleInterval</key>\n  <integer>30</integer>')
  })

  it('to be limited to the owner session, where the keychain is, with a PATH and a HOME', () => {
    expect(plist).toContain('<key>LimitLoadToSessionType</key>\n  <string>Aqua</string>')
    expect(plist).toContain('<key>PATH</key>\n    <string>/opt/homebrew/bin:/usr/bin</string>')
    expect(plist).toContain('<key>HOME</key>\n    <string>/Users/me</string>')
  })

  it('to be logging standard output and errors to the same file', () => {
    expect(plist).toContain('<key>StandardOutPath</key>\n  <string>/Users/me/.slack-dispatch/service.log</string>')
    expect(plist).toContain('<key>StandardErrorPath</key>\n  <string>/Users/me/.slack-dispatch/service.log</string>')
  })

  it('to be carrying no token: only the PATH and the HOME are given to the job', () => {
    expect(plist.match(/<key>/g)).toHaveLength(14)
    expect(plist).not.toMatch(/xox[abp]-|xapp-|TOKEN|API_KEY/)
  })

  it('to be safe to put a folder name with markup characters in', () => {
    const risky = renderPlist({ ...input, packageDir: '/Users/a&b/<x>/"y"/\'z\'', home: '/Users/a&b' })
    expect(risky).toContain('/Users/a&amp;b/&lt;x&gt;/&quot;y&quot;/&apos;z&apos;')
    expect(risky).not.toContain('<x>')
  })
})

describe('labelFor as the name of the job', () => {
  it('to be com.<user>.slack-dispatch, like the other agents of the same user', () => {
    expect(labelFor('chungheon')).toBe('com.chungheon.slack-dispatch')
  })

  it.each([
    ['john doe', 'com.john-doe.slack-dispatch'],
    ['a/b', 'com.a-b.slack-dispatch'],
    ['', 'com.user.slack-dispatch'],
  ])('to be a label with only the characters a label may hold for %j', (user, label) => {
    expect(labelFor(user)).toBe(label)
  })
})

describe('findOnPath as the place of a program', () => {
  const exists = (file: string): boolean => ['/a/bin/claude', '/b/bin/claude', '/b/bin/gh'].includes(file)

  it('to be the first folder of the PATH that has it', () => {
    expect(findOnPath('claude', '/x:/a/bin:/b/bin', exists)).toBe('/a/bin/claude')
    expect(findOnPath('gh', '/x:/a/bin:/b/bin', exists)).toBe('/b/bin/gh')
  })

  it('to be undefined when no folder has it, and empty entries are skipped', () => {
    expect(findOnPath('orca', '/x::/a/bin', exists)).toBeUndefined()
    expect(findOnPath('claude', '', exists)).toBeUndefined()
  })
})

describe('servicePath as the PATH the job gets', () => {
  it('to be the folder of each program found, once each, then the system folders', () => {
    expect(servicePath(['/opt/homebrew/bin/claude', '/opt/homebrew/bin/gh', '/Users/me/.local/bin/pnpm'])).toBe(
      '/opt/homebrew/bin:/Users/me/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    )
  })

  it('to be only the system folders when nothing was found', () => {
    expect(servicePath([])).toBe('/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin')
  })

  it('to be asked for every program the service starts', () => {
    expect([...REQUIRED_PROGRAMS]).toStrictEqual(['node', 'pnpm', 'claude', 'orca', 'gh', 'git', 'security'])
  })
})

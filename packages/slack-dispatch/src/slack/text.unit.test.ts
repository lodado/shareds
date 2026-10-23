import { describe, expect, it } from 'vitest'
import { cleanSlackText, extractLinks, githubRepoNames, looksUrgent } from './text'

describe('cleanSlackText as a message the way people read it', () => {
  it.each([
    ['a user mention', 'hi <@UOWNER0001> please look', 'hi @user please look'],
    ['a user mention with a name', 'hi <@U1|leon> ok', 'hi leon ok'],
    ['a channel', 'see <#C123|dev-web> now', 'see #dev-web now'],
    ['a channel without a name', 'see <#C123> now', 'see #channel now'],
    ['an @here', '<!here> deploy now', '@here deploy now'],
    ['a user group', 'cc <!subteam^S1|@ai-frontend>', 'cc @ai-frontend'],
    ['a link with a label', 'fix <https://github.com/o/r/pull/3|PR #3>', 'fix PR #3'],
    ['a bare link', 'see <https://example.com/a>', 'see https://example.com/a'],
    ['entities', 'a &lt;b&gt; &amp; c', 'a <b> & c'],
    ['spaces and line breaks', '  one\n\n two\t three ', 'one two three'],
  ])('to be %s turned into plain text', (_name, raw, expected) => {
    expect(cleanSlackText(raw)).toBe(expected)
  })
})

describe('extractLinks as the links in a message', () => {
  it('to be the links written either way, in order and without repeats', () => {
    const text =
      'PR <https://github.com/o/web-app/pull/3|here> and https://example.com/a?x=1&amp;y=2 again <https://github.com/o/web-app/pull/3>'
    expect(extractLinks(text)).toEqual(['https://github.com/o/web-app/pull/3', 'https://example.com/a?x=1&y=2'])
  })

  it('to be a link without the punctuation that ended the sentence', () => {
    expect(extractLinks('see https://example.com/a. Then https://example.com/b,')).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
  })

  it('to be nothing for a text without links', () => {
    expect(extractLinks('no links here')).toEqual([])
  })
})

describe('githubRepoNames as the repos that GitHub links point to', () => {
  it('to be the repo of a pull request, an issue, a plain repo link and a .git clone link', () => {
    expect(
      githubRepoNames([
        'https://github.com/o/web-app/pull/3',
        'https://github.com/o/api-server/issues/9',
        'https://github.com/o/docs',
        'https://github.com/o/mobile.git',
      ]),
    ).toEqual(['web-app', 'api-server', 'docs', 'mobile'])
  })

  it('to be the same repo once, in any letter case of the host', () => {
    expect(githubRepoNames(['https://GitHub.com/o/web-app/pull/1', 'https://github.com/p/web-app/pull/2'])).toEqual([
      'web-app',
    ])
  })

  it.each([
    ['another host', 'https://gitlab.com/o/web-app'],
    ['a host that only contains github.com', 'https://evilgithub.com/o/web-app'],
    ['a link with no repo part', 'https://github.com/o'],
    ['text that is not a link', 'not a url'],
  ])('to be nothing for %s', (_name, link) => {
    expect(githubRepoNames([link])).toEqual([])
  })
})

describe('looksUrgent as words that mean now', () => {
  it.each([
    ['장애 났어요'],
    ['긴급 배포 부탁'],
    ['배포 실패했습니다'],
    ['please rollback'],
    ['this is URGENT'],
    ['P0 incident'],
    ['서비스  다운'],
  ])('to be urgent for "%s"', (text) => {
    expect(looksUrgent(text)).toBe(true)
  })

  it.each([['오늘 점심 뭐 먹을까요'], ['the urgently-named file'], ['MAP0 is fine']])(
    'to be not urgent for "%s"',
    (text) => {
      expect(looksUrgent(text)).toBe(false)
    },
  )
})

import type { RouteConfig } from './route'
import { describe, expect, it } from 'vitest'
import { routeThread } from './route'

const config: RouteConfig = {
  knownRepos: ['web-app', 'api-server', 'mobile-client', 'docs'],
  channelRepos: { 'dev-web': ['web-app'], 'dev-all': ['web-app', 'api-server'], 'dev-gone': ['removed-repo'] },
}

describe('routeThread as the repo a thread is about', () => {
  it('to be the repo a GitHub link points to, sure', () => {
    expect(routeThread({ text: 'please look', links: ['https://github.com/o/api-server/pull/7'] }, config)).toEqual({
      repo: 'api-server',
      confident: true,
      reason: 'GitHub 링크가 가리키는 레포: api-server',
    })
  })

  it('to be the first repo, not sure, when links point to several', () => {
    const result = routeThread(
      { text: '', links: ['https://github.com/o/api-server/pull/7', 'https://github.com/o/web-app/pull/2'] },
      config,
    )
    expect(result).toEqual({
      repo: 'api-server',
      confident: false,
      reason: 'GitHub 링크가 여러 레포를 가리킴: api-server, web-app',
    })
  })

  it('to be a link to a repo this machine does not have ignored, so the next rule decides', () => {
    const result = routeThread(
      { text: 'about web-app', links: ['https://github.com/o/somebody-elses-repo/pull/1'] },
      config,
    )
    expect(result).toEqual({ repo: 'web-app', confident: true, reason: '본문에 레포 이름이 나옴: web-app' })
  })

  it.each([
    ['at the start', 'web-app is broken', true],
    ['before a full stop', 'it is the web-app.', true],
    ['in another letter case', 'Check Web-App please', true],
    ['inside a longer name', 'the web-app-legacy repo', false],
    ['glued to a word', 'myweb-app', false],
  ])('to be %s: matched=%s', (_name, text, matched) => {
    expect(routeThread({ text, links: [] }, config).repo === 'web-app').toBe(matched)
  })

  it('to be a name too short to trust in free text not matched', () => {
    expect(routeThread({ text: 'update the docs please', links: [] }, config)).toEqual({
      repo: null,
      confident: false,
      reason: '레포를 정할 단서가 없음',
    })
  })

  it('to be the first repo, not sure, when the text names several', () => {
    const result = routeThread({ text: 'web-app and api-server both', links: [] }, config)
    expect(result).toEqual({
      repo: 'web-app',
      confident: false,
      reason: '본문에 여러 레포 이름이 나옴: web-app, api-server',
    })
  })

  it('to be the repo mentioned first in the text that is suggested, not the first in the repo list', () => {
    const result = routeThread({ text: 'api-server calls web-app', links: [] }, config)
    expect(result).toEqual({
      repo: 'api-server',
      confident: false,
      reason: '본문에 여러 레포 이름이 나옴: api-server, web-app',
    })
  })

  it('to be the channel repo, sure, when the channel has one', () => {
    expect(routeThread({ text: 'something broke', links: [], channelName: 'dev-web' }, config)).toEqual({
      repo: 'web-app',
      confident: true,
      reason: '채널 #dev-web의 담당 레포: web-app',
    })
  })

  it('to be the first channel repo, not sure, when the channel has several', () => {
    expect(routeThread({ text: 'something broke', links: [], channelName: 'dev-all' }, config)).toEqual({
      repo: 'web-app',
      confident: false,
      reason: '채널 #dev-all의 담당 레포가 여러 개: web-app, api-server',
    })
  })

  it('to be nothing for a channel whose repos are not on this machine or that is unknown', () => {
    for (const channelName of ['dev-gone', 'nowhere', 'constructor', undefined]) {
      expect(routeThread({ text: 'hello', links: [], channelName }, config).repo).toBeNull()
    }
  })

  it('to be the link rule over the text rule over the channel rule', () => {
    const input = {
      text: 'about mobile-client',
      links: ['https://github.com/o/api-server/pull/1'],
      channelName: 'dev-web',
    }
    expect(routeThread(input, config).repo).toBe('api-server')
    expect(routeThread({ ...input, links: [] }, config).repo).toBe('mobile-client')
    expect(routeThread({ ...input, links: [], text: 'hello' }, config).repo).toBe('web-app')
  })

  it('to be a repo name with regular expression characters matched literally', () => {
    const odd: RouteConfig = { knownRepos: ['my.repo+x', 'my-repo-x'] }
    expect(routeThread({ text: 'see my-repo-x', links: [] }, odd).repo).toBe('my-repo-x')
    expect(routeThread({ text: 'see my.repo+x here', links: [] }, odd).repo).toBe('my.repo+x')
    expect(routeThread({ text: 'see myXrepo+x', links: [] }, odd).repo).toBeNull()
  })
})

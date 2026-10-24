import type { StatusServer, StatusSnapshot } from './status'
import { request } from 'node:http'
import { networkInterfaces } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { describeError, startStatusServer } from './status'

const snapshot: StatusSnapshot = {
  ok: true,
  startedAt: '2026-10-23T05:00:00.000Z',
  stages: { notified: 2, planning: 1 },
  activeRuns: 1,
  lastPollAt: '2026-10-23T05:05:00.000Z',
  lastPollError: null,
}

// fetch never sends a Host header of the test's choosing, so a plain request is made.
function statusWithHost(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path: '/health', headers: { Host: host } }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    outgoing.once('error', reject)
    outgoing.end()
  })
}

const running: StatusServer[] = []
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop()
})

async function start(read: () => StatusSnapshot = () => snapshot): Promise<{ server: StatusServer; base: string }> {
  const server = await startStatusServer({ port: 0, snapshot: read })
  running.push(server)
  return { server, base: `http://127.0.0.1:${server.port}` }
}

describe('startStatusServer as the read-only look at the service', () => {
  it('to be a health answer on /health', async () => {
    const { base } = await start()
    const response = await fetch(`${base}/health`)
    expect([response.status, await response.json()]).toStrictEqual([200, { ok: true }])
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
  })

  it('to be the snapshot on /status, read again at every request', async () => {
    const polls = { count: 0 }
    const { base } = await start(() => {
      polls.count += 1
      return { ...snapshot, activeRuns: polls.count }
    })
    expect(await (await fetch(`${base}/status`)).json()).toMatchObject({ ...snapshot, activeRuns: 1 })
    expect(await (await fetch(`${base}/status?x=1`)).json()).toMatchObject({ activeRuns: 2 })
  })

  it('to be a 404 for any other address', async () => {
    const { base } = await start()
    for (const path of ['/', '/items', '/status/extra', '/%2e%2e/etc']) {
      expect((await fetch(`${base}${path}`)).status).toBe(404)
    }
  })

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('to be a 405 that allows only GET for a %s', async (method) => {
    const { base } = await start()
    const response = await fetch(`${base}/status`, { method })
    expect([response.status, response.headers.get('allow')]).toStrictEqual([405, 'GET'])
  })

  it('to be a 500 without details when the snapshot cannot be made', async () => {
    const { base } = await start(() => {
      throw new Error('database is locked: secret detail')
    })
    const response = await fetch(`${base}/status`)
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('{"ok":false,"error":"status is not available"}')
  })

  it.each(['evil.example:80', 'evil.example', 'localhost', '127.0.0.1:1', 'localhost:99999'])(
    'to be refused with a 403 for a request that names the host %s, as a rebinding page would',
    async (host) => {
      const { server } = await start()
      expect(await statusWithHost(server.port, host)).toBe(403)
    },
  )

  it.each(['localhost', '127.0.0.1', '[::1]'])('to be answered when the host is %s with the port', async (host) => {
    const { server } = await start()
    expect(await statusWithHost(server.port, `${host}:${server.port}`)).toBe(200)
  })

  it('to be listening on the loopback address only, so no other machine can ask', async () => {
    const { server } = await start()
    expect(server.host).toBe('127.0.0.1')
    const outside = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address
    // Reaching this computer by its address on the network must fail; with no network interface there is nothing to try.
    if (outside !== undefined) {
      const attempt = fetch(`http://${outside}:${server.port}/health`, { signal: AbortSignal.timeout(1500) })
      await expect(attempt).rejects.toThrow()
    }
  })

  it('to be an error, not a crash, when the port is taken', async () => {
    const { server } = await start()
    await expect(startStatusServer({ port: server.port, snapshot: () => snapshot })).rejects.toThrow('EADDRINUSE')
  })

  it('to be closed by stop, with open connections too', async () => {
    const { server, base } = await start()
    await fetch(`${base}/health`)
    await server.stop()
    await expect(fetch(`${base}/health`)).rejects.toThrow()
    running.length = 0
  })
})

describe('describeError as an error shown on the status address', () => {
  // built at run time so no token-shaped literal sits in the source
  const botToken = ['xoxb', '1234567890', 'abcdefABCDEF'].join('-')

  it('to be the message with any secret removed', () => {
    expect(describeError(new Error(`slack said no to ${botToken} today`))).toBe('slack said no to [REDACTED] today')
  })

  it('to be one line, cut to 200 characters', () => {
    const shown = describeError(new Error(`first line\nsecond line ${'x'.repeat(500)}`))
    expect(shown.startsWith('first line second line xxx')).toBe(true)
    expect(shown).toHaveLength(200)
    expect(shown).not.toContain('\n')
  })

  it('to be text for anything that is not an Error', () => {
    expect(describeError('plain text')).toBe('plain text')
    expect(describeError(42)).toBe('42')
    expect(describeError(null)).toBe('null')
  })
})

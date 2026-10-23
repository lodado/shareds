import type { SocketEnvelope } from './socket'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { backoffMs, parseIncoming, startSocket } from './socket'
import { FakeConnection } from './testing'

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

interface Rig {
  connections: FakeConnection[]
  urls: string[]
  logs: [string, unknown][]
  sleeps: number[]
  envelopes: SocketEnvelope[]
  stop: () => void
  ready: Promise<void>
}

function rig(onEnvelope: (envelope: SocketEnvelope) => Promise<void> | void = () => undefined): Rig {
  const connections: FakeConnection[] = []
  const urls: string[] = []
  const logs: [string, unknown][] = []
  const sleeps: number[] = []
  const envelopes: SocketEnvelope[] = []
  const socket = startSocket({
    getUrl: () => {
      const url = `wss://example.test/${urls.length}`
      urls.push(url)
      return Promise.resolve(url)
    },
    onEnvelope: (envelope) => {
      envelopes.push(envelope)
      return onEnvelope(envelope)
    },
    connect: () => {
      const connection = new FakeConnection()
      connections.push(connection)
      return connection
    },
    log: (event, detail) => logs.push([event, detail]),
    sleep: (ms) => {
      sleeps.push(ms)
      return Promise.resolve()
    },
  })
  return { connections, urls, logs, sleeps, envelopes, stop: socket.stop, ready: socket.ready }
}

describe('parseIncoming as one text frame from Slack', () => {
  it('to be an envelope with its id, type and payload', () => {
    expect(parseIncoming('{"envelope_id":"e1","type":"interactive","payload":{"a":1}}')).toStrictEqual({
      kind: 'envelope',
      envelope: { envelopeId: 'e1', type: 'interactive', payload: { a: 1 } },
    })
  })

  it('to be a hello, and a disconnect with its reason', () => {
    expect(parseIncoming('{"type":"hello"}')).toStrictEqual({ kind: 'hello' })
    expect(parseIncoming('{"type":"disconnect","reason":"refresh_requested"}')).toStrictEqual({
      kind: 'disconnect',
      reason: 'refresh_requested',
    })
    expect(parseIncoming('{"type":"disconnect"}')).toStrictEqual({ kind: 'disconnect', reason: '' })
  })

  it.each([
    'not json',
    '[]',
    '"text"',
    'null',
    '{"type":"events_api"}',
    '{"envelope_id":5,"type":"x"}',
    '{"envelope_id":"e"}',
  ])('to be ignored for %s', (text) => {
    expect(parseIncoming(text)).toStrictEqual({ kind: 'ignored' })
  })
})

describe('backoffMs as the wait before a new connection', () => {
  it('to be doubling from 500 ms and capped at 30 s', () => {
    expect([0, 1, 2, 3, 6, 7, 20].map(backoffMs)).toStrictEqual([500, 1000, 2000, 4000, 30_000, 30_000, 30_000])
  })
})

describe('startSocket as the connection to Slack', () => {
  it('to be ready after the first hello and acknowledging each envelope before handling it', async () => {
    const seen: string[] = []
    const r = rig((envelope) => {
      seen.push(envelope.envelopeId)
    })
    await tick()
    const [connection] = r.connections
    expect(r.urls).toStrictEqual(['wss://example.test/0'])
    connection?.receive({ type: 'hello' })
    await r.ready
    connection?.receive({ envelope_id: 'e1', type: 'interactive', payload: { x: 1 } })
    expect(connection?.sent).toStrictEqual(['{"envelope_id":"e1"}'])
    await tick()
    expect(seen).toStrictEqual(['e1'])
    r.stop()
  })

  it('to be kept alive when a handler throws, with the failure logged', async () => {
    const r = rig((envelope) => {
      if (envelope.envelopeId === 'bad') throw new Error('boom')
    })
    await tick()
    const connection = r.connections[0]
    connection?.receive({ type: 'hello' })
    connection?.receive({ envelope_id: 'bad', type: 'interactive', payload: {} })
    connection?.receive({ envelope_id: 'good', type: 'interactive', payload: {} })
    await tick()
    expect(r.envelopes.map((envelope) => envelope.envelopeId)).toStrictEqual(['bad', 'good'])
    expect(connection?.sent).toStrictEqual(['{"envelope_id":"bad"}', '{"envelope_id":"good"}'])
    expect(r.logs).toStrictEqual([['handler_failed', { envelopeId: 'bad', error: 'boom' }]])
    r.stop()
  })

  it('to be kept alive when an async handler rejects', async () => {
    const r = rig(() => Promise.reject(new Error('later')))
    await tick()
    r.connections[0]?.receive({ envelope_id: 'e', type: 'interactive', payload: {} })
    await tick()
    expect(r.logs).toStrictEqual([['handler_failed', { envelopeId: 'e', error: 'later' }]])
    r.stop()
  })

  it('to be connected again to a new address after the connection dropped', async () => {
    const r = rig()
    await tick()
    r.connections[0]?.receive({ type: 'hello' })
    r.connections[0]?.drop()
    await tick()
    expect(r.urls).toStrictEqual(['wss://example.test/0', 'wss://example.test/1'])
    expect(r.sleeps).toStrictEqual([500])
    r.stop()
  })

  it('to be closed and reopened when Slack asks for a refresh', async () => {
    const r = rig()
    await tick()
    r.connections[0]?.receive({ type: 'hello' })
    r.connections[0]?.receive({ type: 'disconnect', reason: 'refresh_requested' })
    await tick()
    expect(r.connections[0]?.closed).toBe(true)
    expect(r.connections).toHaveLength(2)
    expect(r.logs).toStrictEqual([['disconnect_requested', 'refresh_requested']])
    r.stop()
  })

  it('to be waiting longer after each connection that never said hello', async () => {
    const r = rig()
    await tick()
    r.connections[0]?.drop()
    await tick()
    r.connections[1]?.drop()
    await tick()
    r.connections[2]?.receive({ type: 'hello' })
    r.connections[2]?.drop()
    await tick()
    expect(r.sleeps).toStrictEqual([1000, 2000, 500])
    r.stop()
  })

  it('to be retried after the address could not be fetched', async () => {
    let calls = 0
    const logs: [string, unknown][] = []
    const connections: FakeConnection[] = []
    const socket = startSocket({
      getUrl: () => {
        calls += 1
        return calls === 1 ? Promise.reject(new Error('rate_limited')) : Promise.resolve('wss://example.test/ok')
      },
      onEnvelope: () => undefined,
      connect: () => {
        const connection = new FakeConnection()
        connections.push(connection)
        return connection
      },
      log: (event, detail) => logs.push([event, detail]),
      sleep: () => Promise.resolve(),
    })
    await tick()
    expect(logs).toStrictEqual([['connect_failed', 'rate_limited']])
    expect(connections).toHaveLength(1)
    socket.stop()
  })

  it('to be logged, without ending the connection, on a socket error', async () => {
    const r = rig()
    await tick()
    r.connections[0]?.fail()
    expect(r.logs).toStrictEqual([['socket_error', undefined]])
    expect(r.connections[0]?.closed).toBe(false)
    r.stop()
  })

  it('to be closed on stop and never connected again', async () => {
    const r = rig()
    await tick()
    r.connections[0]?.receive({ type: 'hello' })
    r.stop()
    await tick()
    expect(r.connections[0]?.closed).toBe(true)
    expect(r.connections).toHaveLength(1)
  })

  it('to be without a new connection when the stop came while the address was being fetched', async () => {
    let release: (url: string) => void = (_url) => undefined
    const connections: FakeConnection[] = []
    const socket = startSocket({
      getUrl: () =>
        new Promise((resolve) => {
          release = resolve
        }),
      onEnvelope: () => undefined,
      connect: () => {
        const connection = new FakeConnection()
        connections.push(connection)
        return connection
      },
      sleep: () => Promise.resolve(),
    })
    await tick()
    socket.stop()
    release('wss://example.test/late')
    await tick()
    expect(connections).toStrictEqual([])
  })
})

describe('startSocket as a connection that goes quiet', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function quietRig(idleMs: number): { connections: FakeConnection[]; logs: string[]; stop: () => void } {
    vi.useFakeTimers()
    const connections: FakeConnection[] = []
    const logs: string[] = []
    const socket = startSocket({
      getUrl: () => Promise.resolve('wss://example.test/idle'),
      onEnvelope: () => undefined,
      connect: () => {
        const connection = new FakeConnection()
        connections.push(connection)
        return connection
      },
      log: (event) => logs.push(event),
      sleep: () => Promise.resolve(),
      idleMs,
    })
    return { connections, logs, stop: socket.stop }
  }

  it('to be closed and opened again once nothing came for the idle time', async () => {
    const r = quietRig(1000)
    await vi.advanceTimersByTimeAsync(0)
    expect(r.connections).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(r.connections).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(r.connections[0]?.closed).toBe(true)
    expect(r.logs).toStrictEqual(['idle_reconnect'])
    await vi.advanceTimersByTimeAsync(0)
    expect(r.connections).toHaveLength(2)
    r.stop()
  })

  it('to be kept open by every message, which starts the idle time again', async () => {
    const r = quietRig(1000)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)
    r.connections[0]?.receive({ type: 'hello' })
    await vi.advanceTimersByTimeAsync(600)
    r.connections[0]?.receive({ envelope_id: 'e1', type: 'interactive', payload: {} })
    await vi.advanceTimersByTimeAsync(600)
    expect(r.connections[0]?.closed).toBe(false)
    expect(r.logs).toStrictEqual([])
    await vi.advanceTimersByTimeAsync(400)
    expect(r.connections[0]?.closed).toBe(true)
    r.stop()
  })

  it('to be no idle reconnect after a connection that closed by itself', async () => {
    const r = quietRig(1000)
    await vi.advanceTimersByTimeAsync(0)
    r.connections[0]?.receive({ type: 'hello' })
    r.connections[0]?.drop()
    await vi.advanceTimersByTimeAsync(0)
    expect(r.connections).toHaveLength(2)
    r.connections[1]?.receive({ type: 'hello' })
    await vi.advanceTimersByTimeAsync(500)
    r.connections[1]?.receive({ envelope_id: 'e', type: 'interactive', payload: {} })
    await vi.advanceTimersByTimeAsync(900)
    expect(r.logs).toStrictEqual([])
    r.stop()
  })
})

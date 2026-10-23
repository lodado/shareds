// Slack Socket Mode on the built-in WebSocket: buttons and DMs arrive here. Each message is acknowledged first and
// handled afterwards, because Slack sends it again when it is not acknowledged within three seconds. A lost
// connection is opened again; a handler that fails never takes the connection down.

export interface SocketEnvelope {
  envelopeId: string
  // events_api for DMs and messages, interactive for button clicks
  type: string
  payload: unknown
}

// The few things the loop needs from a WebSocket, so tests can stand in for the network.
export interface Connection {
  onMessage: (handler: (text: string) => void) => void
  onClose: (handler: () => void) => void
  onError: (handler: () => void) => void
  send: (text: string) => void
  close: () => void
}

export type Connect = (url: string) => Connection

const connectWebSocket: Connect = (url) => {
  const socket = new WebSocket(url)
  return {
    onMessage: (handler) => {
      socket.addEventListener('message', (event) => {
        handler(String(event.data))
      })
    },
    onClose: (handler) => {
      socket.addEventListener('close', () => {
        handler()
      })
    },
    onError: (handler) => {
      socket.addEventListener('error', () => {
        handler()
      })
    },
    send: (text) => {
      socket.send(text)
    },
    close: () => {
      socket.close()
    },
  }
}

export interface SocketOptions {
  // A new address every time: Slack addresses are single use.
  getUrl: () => Promise<string>
  onEnvelope: (envelope: SocketEnvelope) => Promise<void> | void
  connect?: Connect
  // How long a connection may stay silent before it is dropped and opened again. A connection that died without a
  // close (a sleeping laptop, a changed network) would otherwise lose every click until the system gave up on it.
  idleMs?: number
  log?: (event: string, detail?: unknown) => void
  sleep?: (ms: number) => Promise<void>
}

export interface Socket {
  // Resolves when the first connection said hello.
  ready: Promise<void>
  stop: () => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const DEFAULT_IDLE_MS = 10 * 60_000
const BASE_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 30_000

export const backoffMs = (attempt: number): number => Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt)

// What the text of one message is: an envelope to handle, a hello, a request to reconnect, or nothing usable.
export type Incoming =
  | { kind: 'envelope'; envelope: SocketEnvelope }
  | { kind: 'hello' }
  | { kind: 'disconnect'; reason: string }
  | { kind: 'ignored' }

export function parseIncoming(text: string): Incoming {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { kind: 'ignored' }
  }
  if (!isRecord(data)) return { kind: 'ignored' }
  if (data.type === 'hello') return { kind: 'hello' }
  if (data.type === 'disconnect') {
    return { kind: 'disconnect', reason: typeof data.reason === 'string' ? data.reason : '' }
  }
  if (typeof data.envelope_id !== 'string' || typeof data.type !== 'string') return { kind: 'ignored' }
  return { kind: 'envelope', envelope: { envelopeId: data.envelope_id, type: data.type, payload: data.payload } }
}

export function startSocket(options: SocketOptions): Socket {
  const connect = options.connect ?? connectWebSocket
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS
  const log = options.log ?? (() => undefined)
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  let stopped = false
  // Read through a function so the checks around an await are not narrowed to the value they had before it.
  const isStopped = (): boolean => stopped
  let current: Connection | null = null
  let markReady: () => void = () => undefined
  const ready = new Promise<void>((resolve) => {
    markReady = resolve
  })

  // A handler that throws, even before its first await, is logged and goes no further.
  function dispatch(envelope: SocketEnvelope): void {
    Promise.resolve()
      .then(() => options.onEnvelope(envelope))
      .catch((error: unknown) => log('handler_failed', { envelopeId: envelope.envelopeId, error: errorText(error) }))
  }

  // One connection from open to close. Resolves with whether it said hello, once it closed for whatever reason.
  function connectOnce(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      let said = false
      const socket = connect(url)
      current = socket
      let idle: ReturnType<typeof setTimeout> | undefined
      const watch = (): void => {
        clearTimeout(idle)
        idle = setTimeout(() => {
          log('idle_reconnect')
          socket.close()
          // A dead connection may never report its close, so it is let go of here.
          resolve(said)
        }, idleMs)
      }
      watch()
      socket.onMessage((text) => {
        watch()
        const incoming = parseIncoming(text)
        switch (incoming.kind) {
          case 'hello':
            said = true
            markReady()
            break
          case 'disconnect':
            log('disconnect_requested', incoming.reason)
            socket.close()
            break
          case 'envelope':
            socket.send(JSON.stringify({ envelope_id: incoming.envelope.envelopeId }))
            dispatch(incoming.envelope)
            break
          case 'ignored':
            break
        }
      })
      socket.onClose(() => {
        clearTimeout(idle)
        resolve(said)
      })
      socket.onError(() => {
        log('socket_error')
      })
    })
  }

  async function loop(): Promise<void> {
    let attempt = 0
    while (!isStopped()) {
      try {
        const url = await options.getUrl()
        // A stop that came while the address was being fetched must not open a connection nobody will close.
        const said = isStopped() ? false : await connectOnce(url)
        attempt = said ? 0 : attempt + 1
      } catch (error) {
        attempt += 1
        log('connect_failed', errorText(error))
      }
      if (!isStopped()) await sleep(backoffMs(attempt))
    }
  }

  loop().catch((error: unknown) => log('loop_failed', errorText(error)))
  return {
    ready,
    stop() {
      stopped = true
      current?.close()
    },
  }
}

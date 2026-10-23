// A read-only look at the running service for the owner's own machine: is it up, what is in each stage, when did it
// last poll Slack. It listens on the loopback address only, answers GET only, and never shows the text of a thread.

import type { RequestListener, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'

export interface StatusSnapshot {
  ok: true
  startedAt: string
  // How many items are in each stage.
  stages: Readonly<Record<string, number>>
  activeRuns: number
  lastPollAt: string | null
  lastPollError: string | null
}

export interface StatusServer {
  // The only address it listens on.
  host: string
  port: number
  stop: () => Promise<void>
}

export interface StatusOptions {
  // 0 lets the system pick, which the tests use.
  port: number
  snapshot: () => StatusSnapshot
}

const HOST = '127.0.0.1'

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

// A page on another site can make the browser reach this address under that site's own name (DNS rebinding); the Host
// header then names that site, and only the loopback names are answered.
function isLoopbackHost(host: string | undefined, port: number): boolean {
  return host === `localhost:${port}` || host === `${HOST}:${port}` || host === `[::1]:${port}`
}

type Respond = (status: number, body: unknown) => void

// What each address answers. Kept apart from the server so the server function stays shallow.
function route(options: StatusOptions, path: string, respond: Respond): void {
  if (path === '/health') {
    respond(200, { ok: true })
    return
  }
  if (path !== '/status') {
    respond(404, { ok: false, error: 'not found' })
    return
  }
  try {
    respond(200, options.snapshot())
  } catch {
    respond(500, { ok: false, error: 'status is not available' })
  }
}

function listener(options: StatusOptions, port: () => number): RequestListener {
  return (request, response) => {
    const respond: Respond = (status, body) => {
      reply(response, status, body)
    }
    if (!isLoopbackHost(request.headers.host, port())) {
      respond(403, { ok: false, error: 'forbidden host' })
      return
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      respond(405, { ok: false, error: 'method not allowed' })
      return
    }
    route(options, (request.url ?? '/').split('?')[0] ?? '/', respond)
  }
}

function closer(server: Server): () => Promise<void> {
  return () =>
    new Promise((done) => {
      server.close(() => {
        done()
      })
      server.closeAllConnections()
    })
}

export function startStatusServer(options: StatusOptions): Promise<StatusServer> {
  return new Promise((resolve, reject) => {
    // The port the system picked is known only after listening, and the host check needs it.
    const bound = { port: options.port }
    const server = createServer(listener(options, () => bound.port))
    server.once('error', reject)
    server.listen(options.port, HOST, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('the status server has no address'))
        return
      }
      bound.port = address.port
      server.off('error', reject)
      resolve({ host: HOST, port: address.port, stop: closer(server) })
    })
  })
}

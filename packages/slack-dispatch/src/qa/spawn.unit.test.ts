import { createServer } from 'node:net'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { createDevServerStarter } from './devserver'
import { freePort, realDevServerDeps } from './spawn'

// A real program that answers on PORT, so the real start, probe and stop are what is tested.
const SERVER = [
  "const http = require('node:http')",
  "http.createServer((request, response) => response.end('ok')).listen(Number(process.env.PORT), () => {",
  "  console.log('Local: http://localhost:' + process.env.PORT)",
  '})',
].join('\n')

describe('freePort as a port nobody listens on', () => {
  it('to be a port that can be listened on at once', async () => {
    const port = await freePort()
    expect(port).toBeGreaterThan(1023)
    await new Promise<void>((resolve, reject) => {
      const server = createServer()
      server.on('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.close(() => {
          resolve()
        })
      })
    })
  })
})

describe('the real dev server as a program started, asked and stopped', () => {
  it('to be answering on its port while running, and gone after the stop', async () => {
    const start = createDevServerStarter(realDevServerDeps)
    const port = await freePort()
    const server = await start({
      cwd: process.cwd(),
      command: process.execPath,
      args: ['-e', SERVER],
      port,
      env: {},
      timeoutMs: 30_000,
    })
    expect(server.baseUrl).toBe(`http://localhost:${port}`)
    expect((await fetch(`${server.baseUrl}/anything`)).status).toBe(200)
    await server.stop()
    await expect(fetch(`${server.baseUrl}/anything`)).rejects.toThrow()
  })

  it('to be started without the variables that sign in anywhere, even when the service has them', async () => {
    process.env.ANTHROPIC_API_KEY = 'service-only-secret'
    process.env.GH_TOKEN = 'service-only-token'
    try {
      const start = createDevServerStarter(realDevServerDeps)
      const script = [
        "const http = require('node:http')",
        'http.createServer((request, response) => {',
        "  response.end([String(process.env.ANTHROPIC_API_KEY), String(process.env.GH_TOKEN), typeof process.env.PATH].join('|'))",
        "}).listen(Number(process.env.PORT), () => console.log('http://localhost:' + process.env.PORT))",
      ].join('\n')
      const server = await start({
        cwd: process.cwd(),
        command: process.execPath,
        args: ['-e', script],
        port: await freePort(),
        env: {},
        timeoutMs: 30_000,
      })
      expect(await (await fetch(server.baseUrl)).text()).toBe('undefined|undefined|string')
      await server.stop()
    } finally {
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.GH_TOKEN
    }
  })

  it('to be an error with its output when the program cannot run', async () => {
    const start = createDevServerStarter(realDevServerDeps)
    await expect(
      start({
        cwd: process.cwd(),
        command: process.execPath,
        args: ['-e', "console.error('boom'); process.exit(3)"],
        port: await freePort(),
        env: {},
        timeoutMs: 30_000,
      }),
    ).rejects.toThrow('the dev server exited with code 3: boom')
  })
})

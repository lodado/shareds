// Shows a running agent in the terminal tab it runs in: follows the stream file claude writes and prints what
// `viewStreamLine` makes of each line, until the claude process is gone and the file is read to the end.
// Usage: node stream-view.mjs <stream file> <claude pid>

import { Buffer } from 'node:buffer'
import { closeSync, existsSync, openSync, readSync } from 'node:fs'
import process from 'node:process'
import { StringDecoder } from 'node:string_decoder'
import { setTimeout as sleep } from 'node:timers/promises'
import { viewStreamLine } from '../src/agent/stream-view.ts'

const POLL_MS = 300

const [file = '', pidText = ''] = process.argv.slice(2)
const pid = Number(pidText)

function alive() {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function show(line) {
  for (const shown of viewStreamLine(line)) process.stdout.write(`${shown}\n`)
}

const decoder = new StringDecoder('utf8')
const buffer = Buffer.alloc(64 * 1024)
let offset = 0
let rest = ''

// Reads what was added to the file since the last call and shows every whole line of it.
function drain(fd) {
  for (;;) {
    const read = readSync(fd, buffer, 0, buffer.length, offset)
    if (read === 0) return
    offset += read
    const lines = (rest + decoder.write(buffer.subarray(0, read))).split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) show(line)
  }
}

while (!existsSync(file)) {
  if (!alive()) process.exit(0)
  await sleep(POLL_MS)
}
const fd = openSync(file, 'r')
for (;;) {
  const running = alive()
  drain(fd)
  if (!running) break
  await sleep(POLL_MS)
}
show(rest + decoder.end())
closeSync(fd)

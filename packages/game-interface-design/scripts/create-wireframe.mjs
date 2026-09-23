#!/usr/bin/env node
// Copies the Stack greybox starter into a new directory. Never writes into an existing non-empty target.
import { cpSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const STARTER = fileURLToPath(new URL('../skills/threejs-game-wireframe/starter/', import.meta.url))
const GENERATED = new Set(['node_modules', 'dist', 'test-results', 'playwright-report'])

export function createWireframe(target) {
  const dest = path.resolve(target)
  if (existsSync(dest) && readdirSync(dest).length > 0) {
    throw new Error(`${dest} exists and is not empty; refusing to overwrite. Adapt the existing project instead.`)
  }
  cpSync(STARTER, dest, {
    recursive: true,
    filter: (src) => !GENERATED.has(path.basename(src)),
  })
  return dest
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2]
  if (!target) {
    console.error('usage: create-wireframe.mjs <target-dir>')
    process.exitCode = 2
  } else {
    try {
      const dest = createWireframe(target)
      console.log(`Created ${dest}`)
      console.log('Next: npm ci && npm run verify   (downloads packages; Playwright needs a Chromium build)')
    } catch (error) {
      console.error('ERROR:', error.message)
      process.exitCode = 1
    }
  }
}

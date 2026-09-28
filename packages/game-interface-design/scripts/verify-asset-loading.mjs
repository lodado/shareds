import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const starter = join(packageRoot, 'skills/threejs-game-wireframe/starter')
const fixture = join(packageRoot, 'scripts/fixtures/asset-loading')
const evidence = join(packageRoot, '.test-tmp/asset-loading')
await mkdir(evidence, { recursive: true })
const tmp = await mkdtemp(join(evidence, 'run-'))
const log = join(evidence, `${basename(tmp)}.log`)
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
let output = ''

function run(command, args) {
  output += `$ ${command} ${args.join(' ')}\n`
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited ${code}; evidence: ${log}`))
    })
  })
}

try {
  await cp(starter, tmp, {
    recursive: true,
    filter: (source) => !['node_modules', 'dist', 'test-results', 'playwright-report'].includes(basename(source)),
  })
  await cp(join(fixture, 'src'), join(tmp, 'src'), { recursive: true })
  for (const file of ['index.html', 'fixture.spec.mjs', 'playwright.config.mjs', 'vite.config.mjs', 'generate-glb.mjs']) {
    await cp(join(fixture, file), join(tmp, file))
  }
  await rm(join(tmp, 'playwright.config.ts'))
  await run(npm, ['ci', '--ignore-scripts'])
  await run(process.execPath, ['generate-glb.mjs'])
  await run(npm, ['run', 'build'])

  const dist = join(tmp, 'dist')
  const manifest = JSON.parse(await readFile(join(dist, '.vite/manifest.json'), 'utf8'))
  const files = await readdir(dist, { recursive: true })
  assert.equal(files.filter((file) => file.endsWith('.glb')).length, 4)
  const scripts = await Promise.all(files.filter((file) => file.endsWith('.js')).map((file) => readFile(join(dist, file), 'utf8')))
  const scriptText = scripts.join('\n')
  for (const name of ['character-a', 'character-b', 'map', 'skin']) {
    const source = `src/assets/${name}.glb`
    const entry = manifest[source]
    assert.equal(entry?.file?.endsWith('.glb'), true, `manifest missing ${source}`)
    const original = await readFile(join(tmp, source))
    assert.deepEqual(await readFile(join(dist, entry.file)), original, `emitted ${source} differs`)
    // Fixture-specific byte encodings, not an analyzer for arbitrary obfuscated payloads.
    assert.equal(scriptText.includes(original.toString('base64')), false, `${source} base64 in JS`)
    assert.equal(scriptText.includes([...original].join(',')), false, `${source} byte array in JS`)
    output += `ASSET ${source} -> ${entry.file}: external bytes match\n`
  }
  assert.equal(scriptText.includes('local GLB regression fixture'), false, 'fixture GLB JSON in JS')
  assert.deepEqual(await readFile(join(dist, 'models/pixel.png')), await readFile(join(tmp, 'public/models/pixel.png')))
  await run(process.execPath, [join(tmp, 'node_modules/@playwright/test/cli.js'), 'test', 'fixture.spec.mjs', '--config=playwright.config.mjs'])
  console.log(`PASS: production GLB checks; evidence: ${log}; observations: ${join(tmp, 'asset-results.json')}`)
} catch (error) {
  output += `\n${error instanceof Error ? error.stack : String(error)}\n`
  throw error
} finally {
  await writeFile(log, output, 'utf8')
  // Preserve source/build/report evidence, not another permanent dependency installation per run.
  await rm(join(tmp, 'node_modules'), { recursive: true, force: true })
}

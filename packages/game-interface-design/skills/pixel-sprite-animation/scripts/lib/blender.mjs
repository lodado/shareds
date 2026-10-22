// 3D_RIG route: render a rigged .blend (or a demo scene) to small unsmoothed PNG frames for `import`.
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { UsageError } from './errors.mjs'

const SCRIPT = fileURLToPath(new URL('./blender_render.py', import.meta.url))
const KNOWN_BINARIES = ['/Applications/Blender.app/Contents/MacOS/Blender', 'blender']
const FRAME_MARKER = 'PIXEL_SPRITE_FRAME '

const runs = (bin) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0

// An explicit --bin must work as given; only the fallbacks are searched.
function findBlender(explicit) {
  if (explicit) {
    if (!runs(explicit)) throw new UsageError(`--bin ${explicit} does not run as Blender (\`${explicit} --version\` failed)`)
    return explicit
  }
  return [process.env.BLENDER_BIN, ...KNOWN_BINARIES].filter(Boolean).find(runs) ?? null
}

/** Runs Blender in the background; returns the frame paths this run rendered, in order. */
export function renderBlender({ file, demo = false, out, size = '48x48', frames, camera, bin, outline = false }) {
  if (!demo && !file) throw new UsageError('pass a .blend file or --demo')
  const blender = findBlender(bin)
  if (!blender) throw new Error('Blender not found: pass --bin <path> or set BLENDER_BIN')
  const target = path.resolve(out)
  mkdirSync(target, { recursive: true })
  const options = [
    ...(frames ? ['--frames', frames] : []),
    ...(camera ? ['--camera', camera] : []),
    ...(demo ? ['--demo'] : []),
    ...(outline ? ['--outline'] : []),
  ]
  const args = [
    '-b',
    '--factory-startup',
    ...(demo ? [] : [path.resolve(file)]),
    '--python-exit-code',
    '1',
    '--python',
    SCRIPT,
    '--',
    '--out',
    target,
    '--size',
    size,
    ...options,
  ]
  const result = spawnSync(blender, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-12).join('\n')
    throw new Error(`Blender exited with ${result.status}:\n${tail}`)
  }
  return result.stdout
    .split('\n')
    .filter((line) => line.startsWith(FRAME_MARKER))
    .map((line) => line.slice(FRAME_MARKER.length).trim())
}

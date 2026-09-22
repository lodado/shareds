import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pluginDir = path.resolve(configDir, '../eslint-plugin-local-rules')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lodado-pack-'))
const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}
const link = (target, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.symlinkSync(target, destination, 'junction')
}
const pack = (directory, name) => {
  execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--pack-destination', temp], { cwd: directory, stdio: 'pipe' })
  const archive = fs.readdirSync(temp).find((file) => file.startsWith(name) && file.endsWith('.tgz'))
  const unpacked = path.join(temp, name)
  fs.mkdirSync(unpacked)
  execFileSync('/usr/bin/tar', ['-xzf', path.join(temp, archive), '-C', unpacked])
  return path.join(unpacked, 'package')
}
test('packed artifacts enforce the strict contract through CLI', () => {
try {
  const configPackage = pack(configDir, 'lodado-eslint-config-')
  const pluginPackage = pack(pluginDir, 'lodado-eslint-plugin-local-rules-')
  for (const [packed, original] of [[configPackage, configDir], [pluginPackage, pluginDir]]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(packed, 'package.json'), 'utf8'))
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      const target = dependency === '@lodado/eslint-plugin-local-rules' ? pluginPackage : fs.realpathSync(path.join(original, 'node_modules', dependency))
      link(target, path.join(packed, 'node_modules', dependency))
    }
  }
  for (const file of ['strict.mjs', 'strict-cli.mjs', 'STRICT.md', 'examples/strict/eslint.config.mjs']) assert.ok(fs.existsSync(path.join(configPackage, file)), file)
  for (const file of ['rules/strict-ui-boundary.js', 'rules/fsd-strict-boundaries.js', 'rules/lib/strict-paths.js']) assert.ok(fs.existsSync(path.join(pluginPackage, file)), file)
  const consumer = path.join(temp, 'consumer')
  link(configPackage, path.join(consumer, 'node_modules/@lodado/eslint-config'))
  write(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}')
  write(path.join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { allowJs: true, module: 'ESNext', jsx: 'react-jsx' }, include: ['src'] }))
  write(path.join(consumer, 'src/features/orders/index.js'), 'export { Panel } from "./ui/Panel.jsx"')
  const panel = path.join(consumer, 'src/features/orders/ui/Panel.jsx')
  write(panel, "import { useState as state } from 'react'; export function Panel() { state(0); fetch('/users'); return null }")
  const options = { cwd: consumer, tsconfig: path.join(consumer, 'tsconfig.json'), roots: [{ path: 'src' }], rendering: ['src/features/orders/ui/*.jsx'] }
  write(path.join(consumer, 'policy.mjs'), `export default ${JSON.stringify(options)}`)
  write(path.join(consumer, 'eslint.config.mjs'), "import strict from '@lodado/eslint-config/strict'; import options from './policy.mjs'; export default strict(options)")
  const eslintBin = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin/eslint.js')
  const invalid = spawnSync(process.execPath, [eslintBin, '-f', 'json', 'src/features/orders/ui/Panel.jsx'], { cwd: consumer, encoding: 'utf8' })
  assert.equal(invalid.status, 1, `${invalid.stdout}\n${invalid.stderr}`)
  const result = JSON.parse(invalid.stdout)[0]
  assert.equal(result.fatalErrorCount, 0)
  assert.ok(result.messages.some((message) => message.ruleId === '@lodado/local-rules/strict-ui-boundary' && message.messageId === 'forbiddenRuntime' && message.severity === 2))
  const cli = path.join(configPackage, 'strict-cli.mjs')
  const invalidCheck = spawnSync(process.execPath, [cli, 'policy.mjs'], { cwd: consumer, encoding: 'utf8' })
  assert.equal(invalidCheck.status, 1, `${invalidCheck.stdout}\n${invalidCheck.stderr}`)
  write(panel, 'export function Panel() { return null }')
  const clean = spawnSync(process.execPath, [cli, 'policy.mjs'], { cwd: consumer, encoding: 'utf8' })
  assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`)
  process.stdout.write('ok packed strict config/plugin consumer (boundary violation exit 1, valid exit 0)\n')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
})

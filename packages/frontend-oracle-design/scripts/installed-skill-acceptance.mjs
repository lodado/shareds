#!/usr/bin/env node
// No host CLI, registry guesses, models, installation, or writes. Cache arguments
// must come from coordinator-verified public installed-plugin lists, not a marketplace.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const SKILLS = Object.freeze(['frontend-contract-design', 'frontend-oracle-design', 'oracle-author', 'oracle-implement', 'oracle-intake', 'oracle-review'])
const PACKAGE = 'packages/frontend-oracle-design'
const METADATA = ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']
const DEFAULT_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const git = (repo, args) => execFileSync('/usr/bin/git', ['-C', repo, ...args], { encoding: 'utf8' })
const hash = path => {
  if (!lstatSync(path).isFile()) throw new Error(`Not a regular file: ${path}`)
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
const inside = (root, path) => path === root || path.startsWith(`${root}${sep}`)

function safePath(root, path) {
  const target = resolve(root, path)
  if (!inside(root, target)) throw new Error(`Path escapes root: ${path}`)
  let current = root
  for (const part of ['', ...relative(root, target).split(sep).filter(Boolean)]) {
    current = join(current, part)
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink rejected: ${current}`)
  }
  if (!inside(realpathSync(root), realpathSync(target))) throw new Error(`Resolved path escapes root: ${path}`)
  return target
}

function filesUnder(root, subpath = '') {
  const path = safePath(root, subpath)
  const stat = lstatSync(path)
  if (stat.isFile()) return [subpath]
  if (!stat.isDirectory()) throw new Error(`Not a regular file/directory: ${path}`)
  return readdirSync(path).sort().flatMap(name => filesUnder(root, join(subpath, name)))
}

function unownedFiles(root, subpath, unchecked) {
  const path = join(root, subpath)
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) {
    if (SKILLS.includes(subpath.split(sep).at(-1)) || subpath.split(sep).at(-1) === 'SKILL.md') safePath(root, subpath)
    unchecked.push(subpath)
    return []
  }
  if (stat.isDirectory()) return readdirSync(path).sort().flatMap(name => unownedFiles(root, join(subpath, name), unchecked))
  if (!stat.isFile()) throw new Error(`Not regular file/directory: ${path}`)
  if (subpath.split(sep).at(-1) === 'SKILL.md') {
    const text = readFileSync(safePath(root, subpath), 'utf8').split('\n---')[0]
    if (SKILLS.some(skill => new RegExp(`^name: ['"]?${skill}['"]?\\s*$`, 'm').test(text))) throw new Error(`Duplicate Jcode skill: ${subpath}`)
  }
  return [subpath]
}

function metadata(root, version) {
  for (const path of METADATA) {
    const value = JSON.parse(readFileSync(safePath(root, path), 'utf8'))
    const name = path === 'package.json' ? '@lodado/frontend-oracle-design-plugin' : 'frontend-oracle-design'
    if (value.version !== version || value.name !== name) throw new Error(`Metadata mismatch: ${root}/${path}`)
  }
}

function entries(root, files, prefix) {
  const actual = files.filter(path => path.split(sep).at(-1) === 'SKILL.md').sort()
  const expected = SKILLS.map(name => join(prefix, name, 'SKILL.md')).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected exactly six SKILL.md entries at ${root}: ${JSON.stringify(actual)}`)
  for (const name of SKILLS) {
    const text = readFileSync(safePath(root, join(prefix, name, 'SKILL.md')), 'utf8')
    if (!text.startsWith('---\n') || !new RegExp(`^name: ['"]?${name}['"]?\\s*$`, 'm').test(text.split('\n---')[0])) {
      throw new Error(`Skill name mismatch: ${name}`)
    }
  }
}

// repo injection is solely for synthetic unit fixtures. The public CLI never
// accepts a source override and requires its canonical repository package path.
export function checkInstallation({ repo = DEFAULT_REPO, version, claudeCache, codexCache, jcodeSkillsRoot = join(homedir(), '.jcode/skills') } = {}) {
  const result = { ok: false, expectedVersion: version ?? null, errors: [], uncheckedUnrelated: { jcode: [] }, localOnly: { claude: [], codex: [], jcode: [] }, hashes: { source: {}, claude: {}, codex: {}, jcode: {} }, evidence: 'byte parity only; cache provenance must be verified through public installed lists' }
  try {
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Explicit closed --version MAJOR.MINOR.PATCH required')
    repo = realpathSync(repo)
    const gitRoot = realpathSync(git(repo, ['rev-parse', '--show-toplevel']).trim())
    if (gitRoot !== repo) throw new Error('Source must be canonical repository root')
    const source = safePath(repo, PACKAGE)
    metadata(source, version)
    const marketplace = JSON.parse(readFileSync(safePath(repo, '.claude-plugin/marketplace.json'), 'utf8'))
    const plugins = marketplace.plugins.filter(plugin => plugin.name === 'frontend-oracle-design')
    if (plugins.length !== 1 || plugins[0].version !== version) throw new Error('Source marketplace plugin version mismatch')
    const manifest = [...new Set(git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', PACKAGE]).split('\0').filter(Boolean))]
      .map(path => relative(source, safePath(repo, path))).sort()
    if (!manifest.length) throw new Error('Empty source manifest')
    entries(source, manifest, 'skills')
    for (const path of manifest) result.hashes.source[path] = hash(safePath(source, path))
    const roots = []
    for (const [host, supplied] of [['claude', claudeCache], ['codex', codexCache], ['jcode', jcodeSkillsRoot]]) {
      try {
        if (typeof supplied !== 'string' || !supplied) throw new Error(`Explicit --${host}-cache required`)
        const root = resolve(supplied)
        safePath(root, '')
        if (inside(repo, realpathSync(root)) || inside(realpathSync(root), repo)) throw new Error('Source checkout is not installed evidence')
        const canonicalRoot = realpathSync(root)
        if (roots.some(other => inside(other, canonicalRoot) || inside(canonicalRoot, other))) throw new Error('Host installation roots must be separate')
        roots.push(canonicalRoot)
        let actual
        let expected
        if (host === 'jcode') {
          // Other named Jcode skills are outside this plugin's ownership. Flat
          // legacy payload is inspected/reported, never deleted or migrated.
          actual = readdirSync(root).sort().flatMap(name => {
            if (SKILLS.includes(name)) return filesUnder(root, name)
            if (name === 'SKILL.md') return filesUnder(root, name)
            // Discover only regular SKILL entries before considering payload.
            // Unrelated links are not followed and cannot certify entry scans.
            const extra = unownedFiles(root, name, result.uncheckedUnrelated.jcode)
            const discoverable = extra.filter(file => file.endsWith(`${sep}SKILL.md`))
            return discoverable.length ? [] : extra
          })
          expected = manifest.filter(path => path.startsWith(`skills${sep}`)).map(path => path.slice(7))
          result.localOnly[host] = actual.filter(path => !expected.includes(path))
          entries(root, actual, '')
        } else {
          actual = filesUnder(root)
          expected = manifest
          metadata(root, version)
          result.localOnly[host] = actual.filter(path => !expected.includes(path))
          entries(root, actual, 'skills')
        }
        result.localOnly[host] = actual.filter(path => !expected.includes(path))
        for (const path of expected) {
          const digest = hash(safePath(root, path))
          result.hashes[host][path] = digest
          const sourcePath = host === 'jcode' ? join('skills', path) : path
          if (digest !== result.hashes.source[sourcePath]) throw new Error(`Byte mismatch: ${host}/${path}`)
        }
      } catch (error) { result.errors.push(`${host}: ${error.message}`) }
    }
  } catch (error) { result.errors.push(`source/arguments: ${error.message}`) }
  result.ok = result.errors.length === 0
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {}
  const flags = { '--version': 'version', '--claude-cache': 'claudeCache', '--codex-cache': 'codexCache', '--jcode-skills-root': 'jcodeSkillsRoot' }
  try {
    const args = process.argv.slice(2)
    for (let index = 0; index < args.length; index += 2) {
      const key = flags[args[index]]
      const value = args[index + 1]
      if (!key || !value || value.startsWith('--') || Object.hasOwn(options, key)) throw new Error(`Invalid/duplicate argument: ${args[index]}`)
      if (key !== 'version' && !isAbsolute(value)) throw new Error(`Absolute cache/directory path required: ${args[index]}`)
      options[key] = value
    }
    const result = checkInstallation(options)
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.ok ? 0 : 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- checker mechanics intentionally run with node --test.
import test from 'node:test'
import { checkInstallation, SKILLS } from './installed-skill-acceptance.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'installed-parity-'))
  const repo = join(root, 'repo')
  const source = join(repo, 'packages/frontend-oracle-design')
  const json = (path, value) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, JSON.stringify(value)) }
  mkdirSync(source, { recursive: true })
  execFileSync('/usr/bin/git', ['init', '-q', repo])
  json(join(repo, '.claude-plugin/marketplace.json'), { plugins: [{ name: 'frontend-oracle-design', version: '0.84.0' }] })
  for (const path of ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    json(join(source, path), { name: path === 'package.json' ? '@lodado/frontend-oracle-design-plugin' : 'frontend-oracle-design', version: '0.84.0' })
  }
  for (const name of SKILLS) {
    mkdirSync(join(source, 'skills', name), { recursive: true })
    writeFileSync(join(source, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\nbody\n`)
  }
  writeFileSync(join(source, '.gitignore'), 'node_modules/\n')
  mkdirSync(join(source, 'node_modules'), { recursive: true })
  writeFileSync(join(source, 'node_modules/ignored'), 'ignored')
  const claudeCache = join(root, 'claude')
  const codexCache = join(root, 'codex')
  const jcodeSkillsRoot = join(root, 'jcode')
  cpSync(source, claudeCache, { recursive: true })
  cpSync(source, codexCache, { recursive: true })
  cpSync(join(source, 'skills'), jcodeSkillsRoot, { recursive: true })
  return { root, repo, source, claudeCache, codexCache, jcodeSkillsRoot, version: '0.84.0' }
}

function scenario(name, mutate, verify) {
  test(name, () => {
    const f = fixture()
    try { mutate(f); verify(checkInstallation(f), f) } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
}
scenario('synthetic full parity and ignored source files', () => {}, result => {
  assert.equal(result.ok, true)
  assert.equal(Object.keys(result.hashes.source).some(path => path.includes('node_modules')), false)
  assert.equal(result.hashes.claude['package.json'], result.hashes.source['package.json'])
  assert.match(result.hashes.jcode[`${SKILLS[0]}/SKILL.md`], /^[a-f0-9]{64}$/)
})
scenario('explicit version required', f => { delete f.version }, result => assert.equal(result.ok, false))
scenario('missing actual cache never falls back to source', f => { rmSync(f.claudeCache, { recursive: true }) }, result => assert.equal(result.ok, false))
scenario('source directory cannot serve as installed cache', f => { f.codexCache = f.source }, result => assert.equal(result.ok, false))
scenario('stale installed version', f => { writeFileSync(join(f.codexCache, 'package.json'), '{"version":"0.83.1"}') }, result => assert.equal(result.ok, false))
scenario('source four metadata alignment', f => { writeFileSync(join(f.repo, '.claude-plugin/marketplace.json'), '{"plugins":[]}') }, result => assert.equal(result.ok, false))
scenario('changed installed bytes', f => { writeFileSync(join(f.jcodeSkillsRoot, SKILLS[0], 'SKILL.md'), 'stale') }, result => assert.equal(result.ok, false))
scenario('missing skill', f => { rmSync(join(f.claudeCache, 'skills', SKILLS[1]), { recursive: true }) }, result => assert.equal(result.ok, false))
scenario('duplicate discoverable core', f => {
  mkdirSync(join(f.codexCache, 'duplicate'), { recursive: true })
  writeFileSync(join(f.codexCache, 'duplicate/SKILL.md'), 'name: frontend-oracle-design')
}, result => assert.equal(result.ok, false))
scenario('extra nondiscoverable payload preserved and reported', f => {
  writeFileSync(join(f.jcodeSkillsRoot, SKILLS[0], 'local-note'), 'keep')
  writeFileSync(join(f.jcodeSkillsRoot, 'old-flat-payload'), 'keep flat')
}, (result, f) => {
  assert.equal(result.ok, true)
  assert.ok(result.localOnly.jcode.includes('old-flat-payload'))
  assert.equal(readFileSync(join(f.jcodeSkillsRoot, 'old-flat-payload'), 'utf8'), 'keep flat')
})
scenario('flat discoverable SKILL fails', f => { writeFileSync(join(f.jcodeSkillsRoot, 'SKILL.md'), 'old core') }, result => assert.equal(result.ok, false))
scenario('extra Jcode duplicate core outside six roots fails', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'old-core'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'old-core/SKILL.md'), '---\nname: frontend-oracle-design\n---\n')
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('Duplicate Jcode skill: old-core/SKILL.md')))
})
scenario('unrelated Jcode named skills allowed', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'unrelated'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'unrelated/SKILL.md'), '---\nname: unrelated\n---\n')
}, result => assert.equal(result.ok, true))
scenario('unrelated Jcode root symlink is unchecked, not followed', f => {
  symlinkSync(join(f.root, 'missing-unrelated-target'), join(f.jcodeSkillsRoot, 'unrelated'))
}, result => {
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.deepEqual(result.uncheckedUnrelated.jcode, ['unrelated'])
  assert.equal(result.localOnly.jcode.includes('unrelated'), false)
})
scenario('unrelated named skill asset symlink is not traversed', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'unrelated'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'unrelated/SKILL.md'), '---\nname: unrelated\n---\n')
  symlinkSync(join(f.root, 'missing-asset-target'), join(f.jcodeSkillsRoot, 'unrelated/asset-link'))
}, result => {
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.deepEqual(result.uncheckedUnrelated.jcode, ['unrelated/asset-link'])
  assert.equal(Object.keys(result.hashes.jcode).some(path => path.startsWith('unrelated/')), false)
})
scenario('owned Jcode directory symlink remains rejected', f => {
  rmSync(join(f.jcodeSkillsRoot, SKILLS[0]), { recursive: true })
  symlinkSync(join(f.source, 'skills', SKILLS[0]), join(f.jcodeSkillsRoot, SKILLS[0]))
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes(`Symlink rejected:`) && error.endsWith(SKILLS[0])))
})
scenario('owned Jcode asset symlink remains rejected', f => {
  symlinkSync(join(f.root, 'missing-asset'), join(f.jcodeSkillsRoot, SKILLS[0], 'asset-link'))
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('Symlink rejected:') && error.endsWith('asset-link')))
})
scenario('outside-six SKILL symlink remains rejected', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'alias'))
  symlinkSync(join(f.source, 'skills', SKILLS[0], 'SKILL.md'), join(f.jcodeSkillsRoot, 'alias/SKILL.md'))
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('Symlink rejected:') && error.endsWith('alias/SKILL.md')))
})
scenario('nested duplicate owned entry survives unrelated asset links', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'unrelated/nested'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'unrelated/SKILL.md'), '---\nname: unrelated\n---\n')
  writeFileSync(join(f.jcodeSkillsRoot, 'unrelated/nested/SKILL.md'), `---\nname: ${SKILLS[0]}\n---\n`)
  symlinkSync(join(f.root, 'missing'), join(f.jcodeSkillsRoot, 'unrelated/asset-link'))
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('Duplicate Jcode skill: unrelated/nested/SKILL.md')))
})
scenario('tracked source manifest remains accepted when subsequently ignored', f => {
  execFileSync('/usr/bin/git', ['-C', f.repo, 'add', 'packages/frontend-oracle-design'])
  for (const root of [f.source, f.claudeCache, f.codexCache]) writeFileSync(join(root, '.gitignore'), 'node_modules/\nskills/\n')
}, result => {
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.match(result.hashes.source[`skills/${SKILLS[0]}/SKILL.md`], /^[a-f0-9]{64}$/)
})
scenario('legacy flat directories reported separately', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'references'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'references/old.md'), 'preserved')
}, result => {
  assert.equal(result.ok, true)
  assert.ok(result.localOnly.jcode.includes('references/old.md'))
})
scenario('escaping symlink rejected without traversal', f => {
  symlinkSync(f.repo, join(f.claudeCache, 'escape'))
}, result => assert.equal(result.ok, false))
scenario('same directory is not two installations', f => { f.codexCache = f.claudeCache }, result => assert.equal(result.ok, false))
scenario('missing explicit cache rejected', f => { delete f.claudeCache }, result => assert.equal(result.ok, false))
scenario('source symlink cannot escape manifest root', f => {
  symlinkSync(join(f.root, 'codex/package.json'), join(f.source, 'escape'))
}, result => assert.equal(result.ok, false))
scenario('symlinked cache root rejected', f => {
  const alias = join(f.root, 'alias')
  symlinkSync(f.codexCache, alias)
  f.codexCache = alias
}, result => assert.equal(result.ok, false))

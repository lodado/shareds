import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const skillsRoot = join(process.cwd(), 'packages')

function findSkillFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return findSkillFiles(path)
    return entry.name === 'SKILL.md' ? [path] : []
  })
}

test('every published skill explicitly permits Bash', () => {
  const skills = findSkillFiles(skillsRoot).filter((path) => path.includes('/skills/'))
  assert.equal(skills.length, 20)
  for (const skill of skills) {
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(readFileSync(skill, 'utf8'))?.[1]
    assert.ok(frontmatter, `${skill}: missing YAML frontmatter`)
    assert.match(frontmatter, /^allowed-tools:\n  - Bash$/m, `${skill}: Bash must be explicitly allowed`)
  }
})

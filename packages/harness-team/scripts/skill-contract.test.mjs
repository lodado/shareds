import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const read = (path) => readFile(join(packageDirectory, path), 'utf8')

test('keeps plugin release metadata versions aligned and describes direct work', async () => {
  const [packageJson, claudePluginJson, codexPluginJson, marketplaceJson] = await Promise.all([
    read('package.json'), read('.claude-plugin/plugin.json'), read('.codex-plugin/plugin.json'),
    readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'),
  ])
  const version = JSON.parse(packageJson).version
  const codexPlugin = JSON.parse(codexPluginJson)
  const entry = JSON.parse(marketplaceJson).plugins.find(({ name }) => name === 'harness-team')
  assert.equal(JSON.parse(claudePluginJson).version, version)
  assert.equal(codexPlugin.version, version)
  assert.equal(codexPlugin.skills, './skills/')
  assert.equal(entry?.version, version)
  assert.equal(entry?.source, './packages/harness-team')
  assert.match(codexPlugin.interface.longDescription, /reviews it in a separate pass/)
  assert.doesNotMatch(JSON.stringify([JSON.parse(packageJson), JSON.parse(claudePluginJson), codexPlugin, entry]), /five-role|independent review|two rounds|round 2|re-review/i)
})

test('keeps the direct workflow, review boundaries, and carry-over', async () => {
  const skill = await read('skills/harness-team/SKILL.md')
  assert.match(skill, /^name: harness-team$/m)
  assert.doesNotMatch(skill.replaceAll('아쎄이!', '').replaceAll('악!', ''), /[\uAC00-\uD7A3]/)
  assert.match(skill, /Recruit!\s+\(아쎄이!\)/)
  assert.match(skill, /Aye,\s+sir!\s+\(악!\)/)
  assert.match(skill, /Use for implementation, bug fixes, refactoring, documentation changes, and reviews/)
  assert.match(skill, /Skip\s+conversation\s+and\s+conceptual\s+explanations/)
  assert.match(skill, /Load\s+once\s+per\s+task\s+unless\s+globally\s+imported/)
  assert.match(skill, /Host\s+and\s+repository\s+rules\s+take\s+precedence/)
  assert.match(skill, /does\s+not\s+change\s+the\s+user-facing\s+tone/)
  assert.match(skill, /Infer\s+the\s+goal\s+from\s+the\s+request/)
  assert.match(skill, /still\s+ask\s+when\s+host\s+rules\s+require\s+it/)
  assert.match(skill, /Verify\s+previous\s+carry-over\s+findings\s+and\s+mistakes\s+against\s+the\s+current\s+code\s+first/)
  assert.match(skill, /fresh\s+session\s+\(in\s+Claude\s+Code,\s+`\/clear`\)\s+costs\s+less,\s+then\s+continue\s+unless\s+the\s+user\s+stops\s+you/)
  assert.match(skill, /For\s+a\s+large\s+request,\s+write\s+the\s+plan\s+to\s+a\s+file\s+where\s+repository\s+rules\s+put\s+plans\s+before\s+building/)
  assert.match(skill, /This\s+skill\s+does\s+not\s+require\s+delegation/)
  assert.match(skill, /other\s+workflows\s+and\s+explicit\s+user\s+requests\s+retain\s+their\s+own\s+delegation\s+rules/)
  assert.doesNotMatch(skill, /subagents?|delegate\s+(?:Scout|Builder|Verifier|a\s+Final\s+Reviewer)/i)
  assert.match(skill, /touches\s+state,\s+ordering,\s+permission,\s+or\s+money\s+logic,\s+authentication,\s+payments/)
  assert.match(skill, /data\s+migration\s+or\s+deletion,\s+concurrency\s+or\s+retries,\s+or\s+irreversible\s+side\s+effects,\s+regardless\s+of\s+file\s+count/)
  assert.match(skill, /For\s+risky\s+work,\s+review-only\s+tasks,\s+or\s+a\s+review\s+the\s+user\s+asked\s+for,\s+perform\s+a\s+separate\s+review\s+pass/)
  assert.match(skill, /disclose\s+that\s+the\s+review\s+was\s+not\s+independent/)
  assert.match(skill, /Review-only\s+tasks\s+make\s+no\s+edits/)
  assert.match(skill, /domain\s+workflow\s+controls\s+its\s+own\s+review\s+procedure/)
  assert.match(skill, /Read\s+every\s+diff\s+line\s+and\s+new\s+file/)
  for (const item of ['Evidence', 'Behavior', 'Tests', 'Fit', 'Cleanup']) assert.match(skill, new RegExp(`- ${item}:`))
  assert.match(skill, /Apply\s+every\s+finding\s+immediately,\s+including\s+nits,\s+then\s+rerun\s+affected\s+checks/)
  assert.match(skill, /do\s+not\s+request\s+another\s+review/)
  assert.match(skill, /If\s+a\s+fix\s+adds\s+behavior\s+the\s+review\s+did\s+not\s+see,\s+run\s+the\s+checks\s+that\s+behavior\s+needs\s+and\s+say\s+so\s+in\s+the\s+report/)
  assert.match(skill, /Reject\s+incorrect\s+findings\s+only\s+with\s+evidence/)
  assert.match(skill, /Carry\s+forward\s+only\s+findings\s+blocked\s+by\s+scope,\s+authority,\s+or\s+a\s+required\s+user\s+decision/)
  assert.match(skill, /Unresolved\s+blockers\s+mean\s+incomplete\s+work/)
  assert.match(skill, /`blocker`\s+\(ships\s+broken\s+or\s+unsafe,\s+or\s+a\s+required\s+check\s+fails\)/)
  assert.match(skill, /Review-only\s+tasks\s+return\s+findings\s+without\s+applying\s+them/)
  assert.match(skill, /Return\s+`PERFECT`\s+only\s+when\s+no\s+findings\s+remain/)
  assert.match(skill, /Never\s+invent\s+runs,\s+reviewers,\s+or\s+savings/)
  assert.match(skill, /project\s+memory\s+named\s+`harness-carry-over`/)
  assert.doesNotMatch(skill, /round\s*2|two\s+rounds|re-review/i)
})

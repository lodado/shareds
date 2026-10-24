import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const read = (path) => readFile(join(packageDirectory, path), 'utf8')

test('keeps plugin release metadata versions aligned', async () => {
  const [packageJson, claudePluginJson, codexPluginJson, marketplaceJson] = await Promise.all([
    read('package.json'),
    read('.claude-plugin/plugin.json'),
    read('.codex-plugin/plugin.json'),
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
})

test('describes a single review everywhere the plugin is listed', async () => {
  const [claudePluginJson, codexPluginJson, marketplaceJson] = await Promise.all([
    read('.claude-plugin/plugin.json'),
    read('.codex-plugin/plugin.json'),
    readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'),
  ])
  const entry = JSON.parse(marketplaceJson).plugins.find(({ name }) => name === 'harness-team')
  const text = JSON.stringify([JSON.parse(claudePluginJson), JSON.parse(codexPluginJson), entry])

  assert.match(JSON.parse(codexPluginJson).interface.longDescription, /reviews it once/)
  assert.doesNotMatch(text, /two rounds|round 2|re-review/i)
})

test('keeps the English workflow scoped with lead-judged staffing, a risky-work guard, at most one review and carry-over', async () => {
  const skill = await read('skills/harness-team/SKILL.md')

  assert.match(skill, /^name: harness-team$/m)
  assert.doesNotMatch(skill.replaceAll('아쎄이!', '').replaceAll('악!', ''), /[\uAC00-\uD7A3]/)
  assert.match(skill, /Recruit!\s+\(아쎄이!\)/)
  assert.match(skill, /Aye,\s+sir!\s+\(악!\)/)
  assert.match(
    skill,
    /^description: Use for implementation, bug fixes, refactoring, documentation changes, and reviews\./m,
  )
  assert.match(skill, /Load\s+once\s+per\s+task\s+unless\s+globally\s+imported/)
  assert.match(skill, /Host\s+and\s+repository\s+rules\s+take\s+precedence/)
  assert.match(skill, /does\s+not\s+change\s+the\s+user-facing\s+tone/)
  assert.match(skill, /Skip\s+conversation\s+and\s+conceptual\s+explanations/)
  assert.match(
    skill,
    /Subagents\s+perform\s+only\s+their\s+assigned\s+role;\s+they\s+do\s+not\s+recruit\s+agents\s+or\s+run\s+this\s+workflow/,
  )
  assert.match(skill, /The\s+lead\s+owns\s+coordination,\s+carry-over,\s+and\s+reporting/)
  for (const role of ['Lead', 'Scout', 'Builder', 'Verifier', 'Final Reviewer']) {
    assert.match(skill, new RegExp(`^\\d\\. \\*\\*${role}\\*\\*`, 'm'), role)
  }
  assert.match(skill, /Infer\s+the\s+goal\s+from\s+the\s+request/)
  assert.match(skill, /still\s+ask\s+when\s+host\s+rules\s+require\s+it/)
  assert.match(
    skill,
    /Verify\s+previous\s+carry-over\s+findings\s+and\s+mistakes\s+against\s+the\s+current\s+code\s+first/,
  )
  assert.match(
    skill,
    /Design,\s+architecture,\s+unknown-cause\s+debugging,\s+and\s+building\s+risky\s+work\s+require\s+the\s+most\s+capable\s+latest-generation\s+reasoning\s+model\s+available,\s+regardless\s+of\s+cost/,
  )
  assert.match(
    skill,
    /The\s+lead\s+picks\s+the\s+Final\s+Reviewer's\s+model\s+from\s+latest-generation\s+models;\s+reviewing\s+risky\s+work\s+or\s+a\s+review\s+the\s+user\s+asked\s+for\s+requires\s+the\s+most\s+capable\s+one\./,
  )
  assert.match(skill, /For\s+other\s+subagent\s+roles,\s+use\s+the\s+cheapest\s+suitable\s+latest-generation\s+model/)
  assert.match(skill, /never\s+choose\s+an\s+older\s+model\s+just\s+to\s+save\s+money/)
  assert.match(
    skill,
    /psychopathic\s+drill-instructor\s+persona:\s+zero\s+tolerance\s+for\s+even\s+the\s+smallest\s+confirmed\s+mistake/,
  )
  assert.match(skill, /obsessive\s+perfectionist\s+who\s+cannot\s+approve\s+work\s+with\s+even\s+the\s+smallest\s+flaw/)
  assert.match(skill, /separate\s+read-only\s+agent,\s+not\s+the\s+author,\s+with\s+independent\s+context/)
  assert.doesNotMatch(skill, /model\s+family/i)
  assert.match(skill, /the\s+lead\s+fills\s+that\s+role/)
  assert.match(skill, /disclose\s+that\s+review\s+was\s+not\s+independent/)
  assert.match(skill, /touches\s+state,\s+ordering,\s+permission,\s+or\s+money\s+logic,\s+authentication,\s+payments/)
  assert.match(
    skill,
    /data\s+migration\s+or\s+deletion,\s+concurrency\s+or\s+retries,\s+or\s+irreversible\s+side\s+effects/,
  )
  assert.match(skill, /or\s+irreversible\s+side\s+effects,\s+regardless\s+of\s+file\s+count/)
  assert.match(
    skill,
    /Work\s+is\s+trivial\s+when\s+it\s+only\s+changes\s+styling\s+\(CSS,\s+design\s+tokens,\s+class\s+names\),\s+copy,\s+formatting,\s+comments\s+\(not\s+lint,\s+type,\s+coverage,\s+or\s+build\s+directives\),\s+or\s+typos,\s+with\s+no\s+change\s+to\s+logic,\s+data,\s+or\s+agent\s+instructions\./,
  )
  assert.match(
    skill,
    /The\s+lead\s+decides\s+whether\s+to\s+delegate\s+a\s+Final\s+Reviewer\s+and\s+which\s+model\s+it\s+runs\s+on;\s+trivial\s+work\s+that\s+is\s+not\s+risky\s+gets\s+none\s+unless\s+the\s+lead\s+asks\s+for\s+one,\s+and\s+risky\s+work\s+always\s+gets\s+one\s+unless\s+a\s+domain\s+workflow\s+supplies\s+its\s+review\.\s+Staff\s+the\s+other\s+roles\s+by\s+the\s+first\s+match:/,
  )
  assert.match(
    skill,
    /first\s+match:\s+-\s+Work\s+the\s+lead\s+judges\s+simple\s+that\s+is\s+not\s+risky:\s+the\s+lead\s+scouts,\s+builds,\s+and\s+verifies,\s+and\s+reads\s+the\s+final\s+diff\.\s+-\s+Everything\s+else:\s+delegate\s+Scout,\s+Builder,\s+and\s+Verifier\.\n/,
  )
  assert.match(skill, /Final\s+Reviewer\s+\(when\s+one\s+runs\)/)
  assert.match(
    skill,
    /If\s+the\s+lead\s+calls\s+for\s+a\s+review\s+and\s+an\s+independent\s+reviewer\s+is\s+unavailable/,
  )
  assert.match(
    skill,
    /Review-only\s+tasks\s+make\s+no\s+edits\s+and\s+delegate\s+no\s+Builder;\s+their\s+review\s+is\s+the\s+deliverable,\s+so\s+the\s+lead\s+always\s+delegates\s+a\s+Final\s+Reviewer\./,
  )
  assert.match(skill, /at\s+most\s+four\s+subagents\s+per\s+task\s+within\s+host\s+concurrency\s+limits/)
  assert.match(skill, /Review\s+the\s+complete\s+change\s+once,\s+exhaustively/)
  assert.match(
    skill,
    /its\s+role\s+and\s+persona\s+from\s+Roles,\s+the\s+requirements,\s+the\s+complete\s+diff,\s+the\s+check\s+results/,
  )
  assert.match(skill, /do\s+not\s+pass\s+the\s+builder's\s+conclusions\s+as\s+facts/)
  assert.match(skill, /Apply\s+every\s+finding\s+immediately,\s+including\s+nits,\s+then\s+rerun\s+affected\s+checks/)
  assert.match(skill, /do\s+not\s+request\s+another\s+review/)
  assert.match(
    skill,
    /If\s+a\s+fix\s+adds\s+behavior\s+the\s+review\s+did\s+not\s+see,\s+run\s+the\s+checks\s+that\s+behavior\s+needs\s+and\s+say\s+so\s+in\s+the\s+report/,
  )
  assert.match(
    skill,
    /Reject\s+incorrect\s+findings\s+only\s+with\s+evidence,\s+and\s+give\s+that\s+evidence\s+in\s+the\s+report/,
  )
  assert.match(
    skill,
    /Carry\s+forward\s+only\s+findings\s+blocked\s+by\s+scope,\s+authority,\s+or\s+a\s+required\s+user\s+decision/,
  )
  assert.match(skill, /Unresolved\s+blockers\s+mean\s+incomplete\s+work,\s+not\s+completion\s+with\s+carry-over/)
  assert.match(skill, /`blocker`\s+\(ships\s+broken\s+or\s+unsafe,\s+or\s+a\s+required\s+check\s+fails\)/)
  assert.match(skill, /Review-only\s+tasks\s+return\s+findings\s+without\s+applying\s+them/)
  assert.match(
    skill,
    /domain\s+workflow\s+fills\s+equivalent\s+roles\s+and\s+controls\s+its\s+own\s+review\s+procedure/,
  )
  assert.match(skill, /Return\s+`PERFECT`\s+only\s+when\s+no\s+findings\s+remain/)
  assert.match(skill, /`unknown`\s+if\s+the\s+host\s+does\s+not\s+say/)
  assert.match(skill, /or\s+that\s+the\s+lead\s+skipped\s+review\s+and\s+why/)
  assert.match(skill, /subagent\s+token\s+counts\s+on\s+one\s+line\s+when\s+the\s+host\s+reports\s+them/)
  assert.match(skill, /Never\s+invent\s+runs,\s+reviewers,\s+or\s+savings/)
  assert.match(skill, /project\s+memory\s+named\s+`harness-carry-over`/)
  assert.doesNotMatch(skill, /round\s*2|two\s+rounds|re-review/i)
})

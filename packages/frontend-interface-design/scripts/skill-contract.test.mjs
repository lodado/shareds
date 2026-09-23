import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package contract tests run with node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveExecutable } from '../../frontend-oracle-design/skills/scripts/resolve-executable.mjs'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/reference-driven-figma-design')
const readSkillFile = (path) => readFile(join(skillDirectory, path), 'utf8')

// Static instruction regression only; scenario behavior and live Figma quality require separate evaluation.
test('locks editable-reference assembly, source inspection, and composability before expansion', async () => {
  const [skill, composition, gate, critique, delivery] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/figma-composition.md'),
    readSkillFile('references/component-source-gate.md'),
    readSkillFile('references/critique-refinement.md'),
    readSkillFile('references/delivery-contract.md'),
  ])

  assert.match(skill, /Reference assembly[\s\S]*Never redraw[\s\S]*screenshot/i)
  assert.match(skill, /product screenshots[\s\S]*content assets[\s\S]*may stay/i)
  assert.match(skill, /one-shot[\s\S]*never waives verification/i)
  assert.match(composition, /screen\/section → composite component → primitive/)
  assert.match(composition, /Search[\s\S]*large unit[\s\S]*applied node/i)
  assert.match(gate, /Figma Make[\s\S]*image fill[\s\S]*editable/i)
  assert.match(gate, /Hug→Fill[\s\S]*alignment[\s\S]*rotation[\s\S]*color override/i)
  assert.match(gate, /local derivative Variant[\s\S]*original layers/i)
  assert.match(critique, /Rejected[\s\S]*structure[\s\S]*mapping immediately/i)
  assert.match(delivery, /Library linkage[\s\S]*actual reuse[\s\S]*visual quality/i)
  assert.match(delivery, /official librar[\s\S]*derivative[\s\S]*linked instance \/ copied frame \/ local derivative/i)
})

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    }),
  )
  return nested.flat()
}

test('routes only Figma-first design requests and forbids silent code or image substitution', async () => {
  const skill = await readSkillFile('SKILL.md')

  assert.match(skill, /name: reference-driven-figma-design/)
  assert.match(skill, /editable Figma product or landing designs/)
  assert.match(skill, /React[\s\S]*HTML\/CSS[\s\S]*Next\.js[\s\S]*Tailwind/)
  assert.match(skill, /PNG, docs, code, generated images never replace editable Figma/i)
  assert.match(skill, /requires Figma read\/write/i)
  assert.match(skill, /No write → BLOCKED/)
  assert.doesNotMatch(skill, /\[TODO:/)
})

test('preserves the source hierarchy and separates visual system from composition', async () => {
  const skill = await readSkillFile('SKILL.md')
  const authority = [
    'PRD / Product Requirements',
    'approved Brand Direction',
    'existing internal Design Assets',
    'selected Figma Base Template',
    'existing Figma Variables / Components',
    'approved previous design patterns',
    'Refero References',
    'external References via Aside/Browser',
    'new design decisions',
  ]

  let cursor = -1
  for (const item of authority) {
    const index = skill.indexOf(item)
    assert.ok(index > cursor, `missing or out-of-order authority: ${item}`)
    cursor = index
  }

  assert.match(skill, /Visual System.*internal system.*Figma Template/s)
  assert.match(skill, /Composition.*Refero.*external examples/s)
  assert.match(skill, /Never copy external color, font, radius, shadow/i)
})

test('locks the journey-first dependency order and material-decision interview contract', async () => {
  const [skill, request, wireframes, foundations] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/request-contract.md'),
    readSkillFile('references/hci-wireframe-workflow.md'),
    readSkillFile('references/foundations-brand-workflow.md'),
  ])

  assert.match(skill, /\]\(references\/foundations-brand-workflow\.md\)/)
  const stages = [
    /Stage 1\s*[—-]\s*Core journey/i,
    /Stage 2\s*[—-]\s*Requirements and wireframes/i,
    /Stage 3\s*[—-]\s*Brand, foundations, and semantic tokens/i,
    /Stage 4\s*[—-]\s*UI composition and verification/i,
  ]
  const executionMatch = skill.match(/## Execution loop[\s\S]*?(?=\n## |$)/i)
  assert.ok(executionMatch, 'missing canonical ## Execution loop section')
  const executionLoop = executionMatch[0]
  let cursor = -1
  for (const stage of stages) {
    const match = executionLoop.match(stage)
    assert.ok(match, `missing canonical stage: ${stage}`)
    const index = match.index ?? -1
    assert.ok(index > cursor, `canonical stages are out of order: ${stage}`)
    cursor = index
  }
  assert.doesNotMatch(executionLoop, /Select base[\s\S]*Research[\s\S]*Sketch/i)
  assert.match(request, /one question per round|normally one question/i)
  assert.match(request, /2[–-]3 independent questions per round/i)
  assert.match(request, /no (?:total|global).*question.*(?:cap|quota)/i)
  assert.match(request, /external grill-me.*optional|grill-me.*unavailable/i)
  assert.match(request, /directly.*user.*question|user-facing.*interview/i)
  assert.doesNotMatch(
    `${skill}\n${request}`,
    /1[–-]3 questions? (?:max|total)|question yourself|self-(?:only|questioning) fallback/i,
  )
  assert.match(wireframes, /screen.*purpose|requirements.*wireframe/i)
  assert.match(wireframes, /loading|empty|error|recovery/i)
  assert.match(executionLoop, /first-value\s+moment\s+\(activation\)/i)
  assert.match(wireframes, /activation.*first-value moment|first-value moment.*activation/is)
  assert.match(wireframes, /true prerequisite.*deferrable guidance/is)
  assert.match(wireframes, /empty state.*activation CTA/is)
  assert.match(wireframes, /Tour dismissed.*not\s+a success state/is)
  assert.match(request, /single action first delivers the core value/i)
  assert.match(foundations, /semantic.*token/i)
  assert.match(foundations, /Variables|Text Styles|editable component/i)
  assert.match(foundations, /read.*access.*not.*import|import.*preflight/i)
})

test('locks refactor preservation, targeted reopening, and explicit output boundaries', async () => {
  const [skill, foundations, delivery] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/foundations-brand-workflow.md'),
    readSkillFile('references/delivery-contract.md'),
  ])

  assert.match(skill, /refactor|reuse.*approved|preserve.*existing/i)
  assert.match(foundations, /refactor.*preserv|reuse.*existing.*(?:ID|asset|component)/i)
  assert.match(foundations, /concrete.*(?:Figma|artifact)|Variables.*(?:Styles|component)/i)
  assert.match(delivery, /partial|upstream|not.*complete|blocked/i)
  assert.match(delivery, /reopen.*(?:earliest|affected)|dependent.*stale/i)
  assert.match(foundations, /Read back\s+bindings/i)
  assert.match(foundations, /mutation(?: is)? authorized[\s\S]*verify propagation/i)
  assert.match(foundations, /Markdown token table[\s\S]*not.*design system/i)
  assert.match(skill, /Never redraw[\s\S]*screenshot/i)
  assert.match(skill, /ux-flow-diagram.*explicit|explicit.*ux-flow-diagram/i)
  assert.match(skill, /requires Figma read\/write|No write.*BLOCKED/i)
})

test('runs internal-first research, a three-section pilot, bounded critique, and asset promotion', async () => {
  const [skill, research, composition, critique, learning] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/research-selection.md'),
    readSkillFile('references/figma-composition.md'),
    readSkillFile('references/critique-refinement.md'),
    readSkillFile('references/asset-learning.md'),
  ])

  assert.match(research, /Existing Component Catalog[\s\S]*Existing Figma Library[\s\S]*Refero/)
  assert.match(research, /preview-only[\s\S]*structure-inspected[\s\S]*editable-verified/)
  assert.match(composition, /1–3 sections\/states within agreed scope/)
  assert.match(skill, /3 highest-impact problems/)
  assert.match(critique, /2–4 meaningful iterations/)
  assert.match(critique, /don't regenerate the whole page/i)
  assert.match(learning, /Experiment → Real Page Usage → Visual Critique → Reuse Evaluation → Approved Pattern/)
  assert.match(learning, /Component Name/)
  assert.match(learning, /Avoid When/)
})

test('ships valid input and output JSON schemas with an editable-Figma completion gate', async () => {
  const request = JSON.parse(await readSkillFile('references/schemas/design-request.schema.json'))
  const delivery = JSON.parse(await readSkillFile('references/schemas/design-delivery.schema.json'))

  assert.equal(request.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(request.properties.deliverable.properties.format.const, 'editable-figma')
  assert.equal(request.properties.deliverable.properties.code_generation_allowed.const, false)
  assert.deepEqual(request.properties.scope.properties.pilot_sections, {
    type: 'array',
    items: { type: 'string', minLength: 1 },
    minItems: 1,
    maxItems: 3,
    uniqueItems: true,
  })

  assert.ok(delivery.properties.status.enum.includes('FIGMA_READY'))
  assert.equal(delivery.properties.figma.properties.code_generated.const, false)
  const readyGate = delivery.allOf[0].then.properties
  assert.equal(readyGate.figma.properties.editable.const, true)
  assert.equal(readyGate.critique.properties.iteration_count.minimum, 1)
  assert.equal(readyGate.critique.properties.iteration_count.maximum, undefined)
  assert.equal(readyGate.verification.properties.preview_inspected.const, true)
})

test('all local references resolve and code-oriented exemplar assets are gone', async () => {
  const skill = await readSkillFile('SKILL.md')
  const links = [...skill.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])

  for (const link of links) {
    if (/^[a-z]+:/i.test(link)) continue
    await access(resolve(skillDirectory, link))
  }

  const files = await walk(skillDirectory)
  const prohibited = files.filter((file) => ['.html', '.css', '.jsx', '.tsx'].includes(extname(file)))
  assert.deepEqual(prohibited, [])
})

test('plugin identity stays upgrade-compatible while UI and skill routing become Figma-specific', async () => {
  const [codexManifest, claudeManifest, packageManifest, openai] = await Promise.all([
    readFile(join(packageDirectory, '.codex-plugin/plugin.json'), 'utf8').then(JSON.parse),
    readFile(join(packageDirectory, '.claude-plugin/plugin.json'), 'utf8').then(JSON.parse),
    readFile(join(packageDirectory, 'package.json'), 'utf8').then(JSON.parse),
    readSkillFile('agents/openai.yaml'),
  ])

  assert.equal(codexManifest.name, 'frontend-interface-design')
  assert.equal(codexManifest.version, packageManifest.version)
  assert.equal(claudeManifest.version, packageManifest.version)
  // Marketplace metadata belongs to the monorepo, not an individual installed plugin.
  const repositoryDirectory = dirname(dirname(packageDirectory))
  if (packageDirectory === join(repositoryDirectory, 'packages/frontend-interface-design')) {
    const marketplace = JSON.parse(await readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'))
    assert.equal(marketplace.plugins.find(({ name }) => name === codexManifest.name)?.version, packageManifest.version)
  }
  assert.equal(codexManifest.interface.displayName, 'Reference-Driven Figma Design')
  assert.match(codexManifest.description, /editable Figma/)
  assert.equal(claudeManifest.name, 'frontend-interface-design')
  assert.equal(packageManifest.name, '@lodado/frontend-interface-design-plugin')
  assert.match(openai, /value: figma/)
  assert.match(openai, /\$reference-driven-figma-design/)

  const legacyDirectory = join(packageDirectory, 'skills/frontend-interface-design')
  const legacy = await readFile(join(legacyDirectory, 'SKILL.md'), 'utf8')
  assert.match(legacy, /name: frontend-interface-design/)
  const target = legacy.match(/\]\(([^)]+)\)/)?.[1]
  assert.ok(target, 'Legacy invocation must resolve to the canonical skill')
  assert.equal(resolve(legacyDirectory, target), join(skillDirectory, 'SKILL.md'))
  await access(resolve(legacyDirectory, target))
})

test('behavior cases cover tool truthfulness, reuse, adaptation, critique, and promotion boundaries', async () => {
  const { cases, schema_version: schemaVersion } = JSON.parse(await readSkillFile('evals/behavior-cases.json'))
  const ids = cases.map(({ id }) => id)

  assert.equal(schemaVersion, '1.0')
  assert.equal(cases.length, 63)
  assert.equal(new Set(ids).size, cases.length)
  for (const id of [
    'editable-reference-assembly-not-redraw',
    'inventory-largest-reusable-units',
    'asset-title-is-not-editability-proof',
    'source-pilot-reflow-and-overrides',
    'structural-rejection-reopens-mapping',
    'hci-wireframe-before-figma-write',
    'hci-screenshot-is-not-interaction-proof',
    'hci-conflicting-reference-models',
    'hci-wireframe-without-write-access',
    'hci-small-edit-reuses-existing-flow',
    'hci-explicit-review-checkpoint',
    'visual-directions-when-unresolved',
    'visual-direction-preserves-locked-design',
    'visual-feedback-targeted-before-after',
    'five-planes-strategy-before-dependent-questions',
    'five-planes-scope-preserves-exclusions',
    'five-planes-structure-policy-grill-fallback',
    'five-planes-skeleton-not-flow-rewrite',
    'five-planes-surface-evidence-and-delegation',
    'five-planes-small-fidelity-skips-interview',
    'five-planes-late-finding-reopens-only-dependencies',
    'journey-first-canonical-order',
    'journey-material-completion-grill',
    'wireframe-requirements-recovery',
    'foundation-semantic-token-artifacts',
    'source-import-preflight-read-not-import',
    'refactor-preserves-approved-system',
    'targeted-reopen-upstream-dependency',
    'boundaries-preserve-no-redraw-and-explicit-diagram',
    'activation-before-onboarding-ceremony',
  ]) {
    assert.ok(ids.includes(id), `Missing assembly regression case: ${id}`)
  }
  for (const entry of cases) {
    assert.ok(entry.prompt.trim(), `${entry.id}: missing prompt`)
    assert.ok(entry.expected_invariants.length >= 3, `${entry.id}: weak expected contract`)
    assert.ok(entry.forbidden.length >= 2, `${entry.id}: weak forbidden contract`)
  }
})

test('requires taxonomy interpretation, separate screen evidence, adaptation and pilot comparison', async () => {
  const main = await readSkillFile('SKILL.md')
  const workflow = await readSkillFile('references/taxonomy-reference-workflow.md')
  assert.match(main, /references\/taxonomy-reference-workflow\.md/)
  for (const heading of [
    '## 1. Dictionary interpretation integrity',
    '## 2. Translate keywords into search intent',
    '## 3. Separate screen evidence from component sources',
    '## 4. Scope active adaptation',
    '## 5. Comparison pilot completion gate',
  ]) {
    assert.ok(workflow.includes(heading), heading)
  }
  assert.match(
    workflow,
    /Taxonomy entries aren't visual evidence[\s\S]*UI-kit import isn't screen-construction evidence/,
  )
  assert.match(workflow, /local derivative component/i)
  assert.match(workflow, /HOLD/)
  assert.match(workflow, /INCOMPLETE/)
  assert.match(workflow, /Small[\s\S]*non-structural fixes[\s\S]*reuse existing rationale/i)
  for (const file of [
    'research-selection.md',
    'figma-composition.md',
    'critique-refinement.md',
    'delivery-contract.md',
  ]) {
    const content = await readSkillFile(`references/${file}`)
    assert.ok(content.includes('taxonomy-reference-workflow.md'), file)
  }
  for (const match of workflow.matchAll(/\]\(([^)]+)\)/g)) {
    const destination = match[1].split('#')[0]
    if (destination && !/^[a-z]+:/i.test(destination)) {
      await access(resolve(skillDirectory, 'references', destination))
    }
  }
})

test('ships source fingerprints and local resolution without redistributing dictionary text', async () => {
  const legacy = await readFile(join(packageDirectory, 'skills/frontend-interface-design/SKILL.md'), 'utf8')
  assert.match(legacy, /\.\.\/reference-driven-figma-design\/references\/taxonomy-reference-workflow\.md/)
  const manifest = JSON.parse(await readSkillFile('references/dictionary-sources.json'))
  assert.equal(manifest.source_index, 'https://vibedesignlab.net/dictionary')
  assert.match(manifest.usage, /Local use only/)
  const names = manifest.files.map(({ name, sha256 }) => {
    assert.match(name, /^[\w.-]+\.md$/)
    assert.match(sha256, /^[\da-f]{64}$/)
    return name
  })
  // Only files the workflow routes to; dev-wiki and photo/generative-image guides are out of scope.
  assert.equal(names.length, 9)
  assert.equal(new Set(names).size, 9)
  assert.equal(names.filter((name) => name.endsWith('taxonomy.md')).length, 6)
  const resolver = await readSkillFile('scripts/resolve_dictionary.py')
  // Installed copies live under the renamed skill directory; the legacy name resolves nothing.
  assert.doesNotMatch(resolver, /skills\/frontend-interface-design\//)
  const workflow = await readSkillFile('references/taxonomy-reference-workflow.md')
  assert.match(workflow, /local-only[\s\S]*never committed to Git or shipped/i)
  assert.match(workflow, /FIGMA_DESIGN_DICTIONARY/)
  const repositoryDirectory = dirname(dirname(packageDirectory))
  if (packageDirectory === join(repositoryDirectory, 'packages/frontend-interface-design')) {
    const dictionaryPaths = ['frontend-interface-design', 'reference-driven-figma-design'].map(
      (skill) => `packages/frontend-interface-design/skills/${skill}/references/dictionary/`,
    )
    const options = { cwd: repositoryDirectory, encoding: 'utf8' }
    const gitExecutable = resolveExecutable('git')
    assert.equal(execFileSync(gitExecutable, ['ls-files', '--', ...dictionaryPaths], options).trim(), '')
    const probes = dictionaryPaths.map((path) => `${path}taxonomy.md`)
    assert.deepEqual(
      execFileSync(gitExecutable, ['check-ignore', '--no-index', '--', ...probes], options)
        .trim()
        .split('\n'),
      probes,
    )
  }
})

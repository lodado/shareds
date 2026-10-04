# Frontend Oracle Role Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship five discoverable Oracle skill entries with a thin controller, four bounded specialist roles, and unchanged authoritative runtime gates.

**Architecture:** Nest the existing canonical skill resources under `skills/frontend-oracle-design/`, add four sibling specialist entries, and move detailed operating instructions to role-scoped canonical references. Reuse existing reference routing, stages, protocol, ledger and test skill. Update path consumers and validation together rather than adding a parallel runtime.

**Tech Stack:** Markdown skills, JSON reference/workflow contracts, Node ESM, node:test, pnpm/Turbo, existing Claude/Codex plugin manifests and Jcode directory installs.

**Spec:** `docs/superpowers/specs/2026-10-04-oracle-role-modularization-design.md`

## Global Constraints

- Baseline c8bd27b, release target 0.83.0 in all four existing release metadata locations.
- Exactly five named entries in one plugin. No duplicate flat `skills/SKILL.md`, new dependency, state, ledger, mandatory artifact or verification exemption.
- Core entry ceiling 140 lines; intake 150, author 240, implement/review 180. Completeness matters more than filling a minimum.
- Preserve model-first, human confirmation, immutable locks, explicit `$test`, VALID_RED, zero-production ALREADY_SATISFIED, independent review and shared budgets.
- Preserve pre-existing user untracked files named in the spec.
- Use existing canonical references, typed routes and manual conditions. No handwritten bundle changes.
- All shell commands use rtk. File edits use edit/replace/apply_patch/write. Coordinate workers by disjoint ownership, not extra branches/worktrees.
- No installation refresh until a successful push. No force push, password changes or deletion of local-only install content.

## Review Focus

1. A host discovers both flat and nested entries: require absence of flat SKILL.md and exactly five matching names.
2. A specialist is invoked directly without approved sources, lock or RED: it must return to controller instead of authorizing writes.
3. A fresh worker inherits the controller's loaded-node assumptions: require its own dependencies and preserve blinded reviewer inputs.
4. A moved script still resolves an old fixed-depth package/version/graph path: exercise real CLI, worker and sibling integration tests.
5. Existing GREEN/holds/visual-pending evidence is resumed: preserve the current runtime's no-double-transition and final-state checks.

## Execution record

- User approved the displayed design and asked to proceed. This document records its implementation, not a new product scope.
- Coordinator handles shared runtime/path integration. Disjoint documentation and contract-test work may be delegated, followed by a fresh whole-change review.
- Baseline package test was started before edits as background task `256426e1jb`.

## Task 1: Pin modular skill discovery and role contracts

**Files:**

- Create: `packages/frontend-oracle-design/scripts/modular-skills.test.mjs`
- Modify later: `packages/frontend-oracle-design/package.json`

**Interfaces:**

- Consumes: the real plugin directory and public node CLI, not a copied runtime.
- Produces: discovery, link, entry-size, role-authority and core CLI regression coverage.

- [ ] Add tests before implementation. The missing structure must fail via explicit assertions, not accidental module-load errors:

```js
const names = ['frontend-oracle-design', 'oracle-intake', 'oracle-author', 'oracle-implement', 'oracle-review']
for (const name of names) {
  const entry = join(pluginDirectory, 'skills', name, 'SKILL.md')
  assert.ok(existsSync(entry), `${name} must be discoverable`)
  const text = await readFile(entry, 'utf8')
  assert.match(text, new RegExp(`^name: ${name}$`, 'm'))
}
assert.equal(existsSync(join(pluginDirectory, 'skills/SKILL.md')), false)
```

- [ ] Add assertions for root links to every sibling, `$test` invocation, bounded roles, no self-approval, independent review, shared budgets and non-duplicated scripts.
- [ ] Resolve each relative Markdown link from its actual document directory and check its target exists. Exclude external links and same-document fragments, not broken local links.
- [ ] Run `rtk test node --test packages/frontend-oracle-design/scripts/modular-skills.test.mjs` and record the intended missing-entry failure.

## Task 2: Relocate the canonical core and preserve runtime integration

**Files:**

- Move: `packages/frontend-oracle-design/skills/{SKILL.md,README.md,references,scripts,bundles,evals}` under `skills/frontend-oracle-design/`.
- Modify: package scripts, hooks/hooks.json, `.github/workflows/test-reusable.yml`, affected sibling imports and tracked current documentation.
- Modify: moved `oracle-run.mjs` fixed-depth package lookup, eval/tool/test root lookups and version metadata.

**Interfaces:**

- Consumes: one unchanged runtime and the task-1 discovery contract.
- Produces: the canonical new core location with existing CLI commands, source schemas and gate behavior preserved.

- [ ] Wait for baseline package tests to finish before moving files under them.
- [ ] Use git moves for the existing resource directories. Do not split or duplicate runtime modules.
- [ ] Update explicit path consumers. The canonical public entry becomes:

```text
packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-run.mjs
```

- [ ] Update package commands to include both suites:

```json
"test": "node --test scripts/*.test.mjs skills/frontend-oracle-design/scripts/*.test.mjs"
```

- [ ] Preserve reference path confinement and adjust only plugin/repository-relative lookups affected by the extra level.
- [ ] Extend hook activation matching to all five exact Oracle names, including namespaced/slash invocation, with positive and unrelated-name negative cases before changing implementation.
- [ ] Run the real reference router, bundle/doc checks, package tests and affected test/system-design/visual-qa/interface-design suites.

## Task 3: Extract controller and specialist operating instructions

**Files:**

- Modify: `skills/frontend-oracle-design/SKILL.md`
- Create: `skills/oracle-{intake,author,implement,review}/SKILL.md`
- Create as needed: core `references/roles/*.md`
- Modify where required: core `references/reference-graph.json`, existing mixed references and workflow task instructions.
- Modify: existing document contract tests to read the explicit new owner, not disable their assertions.

**Interfaces:**

- Consumes: source-bound inputs, current stage/ledger, current core runtime and role-scoped canonical references.
- Produces: five discoverable entry contracts with valid links and no second control plane.

- [ ] Preserve the old operator rules by assigning each to a controller, specialist or existing reference owner. Keep an auditable mapping in the change documentation.
- [ ] Write root routing: scope/mode/resume -> intake -> axis confirmation -> author -> independent contract review -> human confirmation/lock -> test/implement -> closure -> independent delivery review -> verified report.
- [ ] Write each specialist's prerequisites, allowed writes, forbidden actions, conditional references, returned artifacts and failure route. No specialist may treat its return value as a runtime transition.
- [ ] Keep author model and projected contract together, with pre-lock source/model safeguards and manual card duties. Closure cannot silently edit locked policy.
- [ ] Separate intake interview loading from author-only detail where reference dependencies currently force it, without skipping the same obligations at the author stage.
- [ ] Update existing static assertions to their real owner documents while preserving runtime tests. Add link/reachability tests so moving text to an unreferenced file cannot pass.
- [ ] Regenerate bundles and workflow README through the existing generators. Run `--check` afterwards.
- [ ] Rerun modular tests and old contract/communication/mandatory verification/guardrail tests.

## Task 4: Prove, review and release

**Files:**

- Modify: package.json, both plugin manifests and marketplace version to 0.83.0.
- Modify: AGENTS.md installation layout example and current README links/role explanation.
- Create: `docs/reviews/2026-10-04-oracle-role-modularization-verification.md`

**Interfaces:**

- Consumes: real changed repository and test results.
- Produces: reviewed commits, pushed source when permitted, installed five-entry layouts with source parity, and an honest evidence report.

- [ ] Run `rtk test pnpm --filter @lodado/frontend-oracle-design-plugin test`, the actual repository `rtk test pnpm test`, relevant lint and generated checks. Record any baseline/environment failures by name.
- [ ] Exercise actual core CLI routing/guide and existing runtime integration cases after relocation. Inspect plugin discovery with the installed hosts' supported public commands.
- [ ] Run fresh-context specialist pressure checks for missing lock/RED, source/model independence, reviewer no-write/no-approval, and shared-context bundle assumptions.
- [ ] Measure actual entry bytes/lines and selected reference loading, without presenting entry-size reduction as measured full-run token savings.
- [ ] Dispatch an independent whole-change reviewer. Fix material findings with regression coverage and rerun affected checks.
- [ ] Commit only intended files with conventional messages. Verify the diff and preservation of user files before each commit.
- [ ] Push verified commits without force. If transport/auth/remote divergence prevents push, retain commits and report the concrete blocker rather than changing credentials or rewriting history.
- [ ] After successful push, refresh user-scope marketplace/plugin installs using supported local CLI commands. Sync each named skill directory to Jcode with non-deleting rsync and verify parity. Never create Codex plain skill copies.
- [ ] Record any restart requirement or unavailable real-host acceptance honestly, update todo and deliver a concise final report.

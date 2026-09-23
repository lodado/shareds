# Verification — 2026-09-23

## Version 0.1.2 — reuse previous work

Updated recall, log, and generalize to connect prior work to maintained artifacts,
applicability, adaptations, and current verification. Preserved parser headings,
explicit-only saves/generalization, and read-only recall. Package, Claude/Codex
manifests, and the marketplace entry agree on `0.1.2`; the package test now also
checks `package.json` against the marketplace version.

## Results and limits

- PASS: `python3 -m unittest discover -s packages/agent-memory/tests -v` — 8 tests.
- PASS: `python3 -m compileall -q packages/agent-memory/scripts packages/agent-memory/tests`.
- PASS: scoped `pnpm exec prettier --check` and `git diff --check`.
- PASS: one independent, read-only recall exercise in a temporary fixture found
  the existing pagination helper, separated missing filter behavior, treated an
  incompatible/missing legacy implementation as reference-only, and did not
  report historical tests as current passes. A post-run content snapshot was
  unchanged, including the absence of a file requested by an embedded note command.
  This is one bounded model exercise, not automated coverage of all skill behavior.
- BLOCKED: Skill Creator `quick_validate.py` could not start validation because
  the current Python environment lacks PyYAML (`ModuleNotFoundError: yaml`). No
  dependency was installed to work around it. Package frontmatter/discovery and
  parser-contract tests plus Prettier passed; the standalone validator did not.
- N/A: full application tests; no application runtime or installer logic changed.

## Local synchronization

Ran the installer audit, then `--apply --hosts claude codex jcode`, then another
audit. All 18 skill directories match the source; only the 9 changed targets
were replaced. Their backups were checked against the pre-change source under
`~/.local/state/agent-memory-skill-backups/20260923T090621474805Z/`.

No private vault notes, host instruction files, plugin caches, other host roots,
or host application binaries were changed. Reload or start a fresh host session
to discover updated instructions. Automatic pre-task recall is documented as an
opt-in host instruction; this installation does not enable it globally. No live
vault ingest/generalization or already-running host reload was tested.

---

# Verification — 2026-09-08

## Change plan and boundaries

Preserve existing ingest/parser and explicit promotion boundaries; separate
retrieval, evidence logging, conditional generalization, learning reflection,
rule review and maintenance. Keep existing vault layout. Replace forced study
note creation with a question/candidate outcome. Add a dry-run-first installer
with backup and rollback rather than modifying host configuration or caches.

Installer regression cases were written first and failed before implementation.
An independent read-only reviewer checked the skill contracts; findings about
date attribution, explicit generalization scope, ingest retries and wiki wiring
were corrected. Evidence tiers remain distinct from promotion eligibility.

## Results

- Package tests: 8 passed (4 installer behavior cases; 4 packaging/contract cases).
- Python compile check: passed; this package has no TypeScript compilation target.
- Skill Creator frontmatter validation: all 6 skills passed (isolated tooling environment).
- Scoped Prettier and `git diff --check`: passed.
- Full repository `pnpm test`: passed, 10 task groups; Oracle suite reported 350 passing tests.
- Full repository `pnpm lint`: failed on the pre-existing modified
  `packages/frontend-oracle-design/skills/scripts/oracle-vitest-reporter.mjs:71`
  unused `error` variable. That unrelated change is excluded from this commit.
- Package lint/compile check passed.

## Local installation audit

Six skills are installed to Claude, Codex, jcode, Cursor and shared `.agents`
skill roots, with content equality checked against this package. Four existing
legacy Claude/Cursor command files were backed up and refreshed to avoid stale
instructions. Backups live outside the repository under
`~/.local/state/agent-memory-skill-backups/`.

Other-skill audit found 4 broken Claude skill symlinks and 39 broken Cursor skill
symlinks; none in Codex, jcode or `.agents`. They are unrelated to this package
and were not deleted or repointed without an authoritative replacement source.
No existing Gemini, OpenCode or Windsurf skill root was found at the standard
locations checked; this is not a claim that those applications are absent.

## Evidence limits

Installation verifies filesystem contents, not already-running host discovery.
Fresh sessions/reload may be needed. Skill behavior was independently reviewed,
not evaluated by live model-driven vault mutations. No real notes, transcripts,
schema files or promoted rules were changed during validation. Installer tests
do not establish whole-batch atomicity: completed hosts remain updated if a later
host fails; per-target backups and idempotent retries support recovery.

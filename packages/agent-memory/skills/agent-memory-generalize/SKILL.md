---
name: agent-memory-generalize
description: Turn explicitly selected Agent Memory evidence into a conditional, reusable concept or implementation recipe.
allowed-tools:
  - Bash
---

# Agent Memory Generalize

Turn a verified lesson into a reusable concept only when it is useful beyond the originating project. This workflow is optional: keep project-local knowledge in the session/project note when evidence is too narrow.

Run when the user requests generalization/concept saving, including an explicitly selected workflow covering that action. A recommendation from another skill is not authorization to mutate the vault. State the target path as part of execution; no extra permission handoff is needed for an already-requested save.

## Workflow

1. Resolve the Agent Memory vault from `AGENT_MEMORY_VAULT`, otherwise `~/Obsidian/AgentMemory`.
2. Read the relevant session and project notes. Separate observed evidence from interpretation.
3. Search existing `wiki/concepts/` notes by meaning, not only title. Prefer a focused merge/update over a duplicate.
4. Choose one outcome: strengthen an existing concept, create a new concept, defer for insufficient evidence, or keep it project-local.
5. Draft using the template below. Keep project-specific paths, component names, routes, and bare before/after numbers out of the definition; put a bounded example under `## Worked example`. For implementation recipes, preserve the original artifact and its verification evidence there so the next task can reuse it rather than reconstruct it from a summary.
6. Check scope, counterexamples, and evidence tier before wiring links. Do not promote rules or modify external rule files as part of this skill.
7. Create concepts at `wiki/concepts/{english-kebab-slug}.md`; use a human-readable title inside the note, not a kebab-case heading.
8. Preserve frontmatter compatibility: `type: skill-insight`, `status: draft`, and `source_session:` (the actual source session wikilink/path).
9. Wire the result surgically: update the project pointer, append the compound line to `wiki/log.md`, and add a `Compounded →` link to the source session. Update other indexes only when materially useful; never bulk-rewrite them.

## Concept template

```markdown
---
type: skill-insight
status: draft
source_session: '[[10-sessions/codex/YYYY-MM-DD-codex-project]]'
---

# {Human-readable conditioned claim}

## Problem class

What recurring class of problem does this address?

## Applicability

When should this approach be considered? What assumptions must hold? For implementation recipes, include relevant stack/version constraints and when not to reuse it.

## Recommended approach

The smallest practical prescription, in your own words. For a reusable implementation, identify what stays unchanged, what must be adapted, and how to check the result in the current environment.

## Trade-offs and limits

Costs, failure modes, exceptions, and what this does not solve.

## Evidence and confidence

- Evidence: [[source session or project note]]
- Evidence status: confirmed / observed / inferred / unverified
- Existing rule-candidate tier: preserve the source note's existing tier; do not relabel it here.
- Confidence: low / medium / high, with a short reason

## Worked example

Optional project-bound illustration. Keep it clearly labeled as an example.

For implementation recipes, record available evidence without inventing missing fields:

- Original artifact: repository, file or entrypoint, and commit if recorded; identify uncommitted changes separately.
- Verified conditions: environment/version, actual verification date, command, and observed result, including checks not run.
- Reuse example: unchanged parts, required adaptations, and limitations; link the actual source session.

## Related

- [[related concept]] — explain the relationship, not just a tag list.
```

## Generalization checks

- The title and definition state a condition, not an unconditional command.
- The body is portable and not a session recap.
- Evidence is linked and limitations are visible.
- Implementation recipes point to the maintained artifact, not a second maintained code copy. A concept is retrieval guidance, not an installed executable skill or proof that the old implementation still works.
- One experience is not presented as universal proof.
- Existing contradictory notes are preserved and linked; do not silently erase them.
- No automatic promotion, deletion, or bulk rewrite.

Report whether the result was merged, created, deferred, or kept local, plus paths and checks performed. Keep the concept's template self-contained; do not require a separate editor-specific command document.

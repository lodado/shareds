---
name: agent-memory-maintenance
description: Review and maintain Agent Memory health without destructive automatic cleanup.
---

# Agent Memory Maintenance

Use when the user asks to audit, revalidate, supersede, or maintain Agent Memory. This is a review workflow, not an automatic cleanup job.

Resolve the vault from `AGENT_MEMORY_VAULT`, falling back to `~/Obsidian/AgentMemory` when unset.

## Safe workflow

1. Resolve the vault and record the local date/timezone used for the review.
2. Inspect the documented schema and available tooling before running commands. Use only verified commands; otherwise perform a read-only manual audit.
3. Check for missing required sections, broken wikilinks, duplicate concepts, stale candidates, and contradictions. Do not rewrite the vault in bulk.
4. For each stale or conflicting item, choose one explicit state: `revalidated`, `superseded`, `deferred`, or `unchanged`.
5. When superseding, preserve the old note, add a dated reason and a link to the replacement, and state the condition under which the old claim no longer applies.
6. Propose deletions separately. Never delete notes, rules, or evidence without explicit user authorization.
7. Report findings, commands/checks actually run, changed paths, and unresolved risks.

## Scoped operational checks

When the repository documents these procedures, review them explicitly and report drift without editing source automatically:

- After a CLI upgrade, verify whether the documented initialization/seed step (for example `agent-memory init`) is required before using the vault.
- When wiki conventions change, compare the README/schema builder (such as `buildVaultSchema()`) with the vault `SCHEMA.md` and record synchronization gaps.
- Check that new environment variables and ingest triggers are documented in the README's related-docs area, not only in hook comments.
- Check that linting or equivalent stale-session/duplicate-candidate checks are documented and available before claiming they were run.

## Revalidation record

```markdown
## Maintenance review — YYYY-MM-DD

- Reviewed item:
- Current evidence:
- Status: revalidated / superseded / deferred / unchanged
- Reason and scope:
- Replacement or related note:
- Next review condition/date:
```

## Review boundaries

- Do not auto-promote candidates; use `agent-memory-p0-rules` for manual promotion review.
- Do not auto-create study notes or concepts merely to satisfy links.
- Do not assume a current-looking timestamp means current truth.
- Keep original evidence and attribution.
- Keep maintenance procedures separate from P0 security and epistemic boundaries.

When no safe change is needed, report the audit as clean rather than manufacturing edits.

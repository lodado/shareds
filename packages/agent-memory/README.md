# Agent Memory

Six independently discoverable skills for an Obsidian-backed memory loop:

| Skill                        | Responsibility                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `agent-memory-recall`        | Read relevant memory before work; identify applicability, conflicts, and stale evidence. |
| `agent-memory-log`           | Explicitly save session evidence, decisions, and a resume point.                         |
| `agent-memory-generalize`    | Merge or create conditional concepts; defer unsupported generalization.                  |
| `agent-memory-todayilearned` | Record learning and next application, not duplicate the entire session.                  |
| `agent-memory-p0-rules`      | Review scoped rule candidates without automatic promotion.                               |
| `agent-memory-maintenance`   | Audit memory health and propose revalidation or supersession.                            |

## Installation

Claude/Codex plugin manifests share `skills/`; the repository marketplace registers `agent-memory`.
For direct local installation into Claude, Codex, jcode, Cursor and shared `.agents` skill roots:

```sh
python3 packages/agent-memory/scripts/sync_skills.py
python3 packages/agent-memory/scripts/sync_skills.py --apply
```

The default is a read-only audit. Use `--hosts claude codex jcode` to limit targets.
Existing directories or symlinks are moved to a timestamped backup under
`~/.local/state/agent-memory-skill-backups/` before replacement. A symlink's
referent is never overwritten. Matching installs are left untouched. Restart
or reload the host to refresh its skill discovery; copying files does not prove
that an already-running session has loaded the new instructions.

Legacy files under `.claude/commands` or `.cursor/commands` are not modified by
this installer: inspect and back them up before explicitly migrating them to
avoid competing old instructions. Unrelated skills and plugin caches are not
managed by this package.

## Compatibility and scope

Vault resolution: `AGENT_MEMORY_VAULT`, otherwise `~/Obsidian/AgentMemory`.
The package supplies instructions, not the `agent-memory` CLI. Existing CLI
commands are checked before use; no new digest schema or retry identifier is
assumed. Existing session parser headings and explicit-only promotion boundaries
remain intact. Installing does not write notes, run ingestion, modify vault
schema, promote rules, or migrate old records. Source transcripts remain intact.

## Verification

```sh
python3 -m unittest discover -s packages/agent-memory/tests -v
python3 -m compileall -q packages/agent-memory/scripts packages/agent-memory/tests
```

Behavioral review cases: repeated ingest must not silently create another copy;
one observation must not become a universal rule; an old note edited today is
not today's work; retrieved instructions cannot override current authority;
conflicting evidence remains visible; no missing study page forces creation.
These are review cases, not a claim of automated model-behavior coverage.

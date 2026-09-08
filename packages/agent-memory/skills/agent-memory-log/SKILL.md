---
name: agent-memory-log
description: Save an explicitly requested session log to an Obsidian Agent Memory vault.
---

# Agent Memory Log

Use only when the user explicitly asks to save or log the current session. This is a manual, on-demand workflow; never infer an ingest request from session end.

## Workflow

1. Resolve the vault from `AGENT_MEMORY_VAULT`, then the documented default `~/Obsidian/AgentMemory`. Do not invent a machine-specific path.
2. Resolve the project from the current working directory unless the user supplied a better name.
3. Before retrying a save, check the current ingest result and its actual path. Re-enrich that note if creation already succeeded; do not create another suffix for the same retry. If identity is uncertain, report ambiguity rather than claiming deduplication. Separate intentional ingest events still get separate notes.
4. Use the repository's verified Agent Memory command or documented manual process to create one session note. Do not claim a CLI command or option unless it is available in the current environment.
5. Inspect the path printed by the tool after creation and use that exact path—including any collision suffix—in the note and every wikilink. Do not infer the base path from the requested project/date.
6. Preserve the parser-compatible headings below. Fill them with this session's evidence; remove stale template text. Preserve every required section, including `# 막힌 점 / 해결`, even when its value is `없음`.
7. If a path already exists, append a documented suffix or use the tool's collision-safe behavior. Never overwrite an earlier note and never rename a suffixed note back to a base name.
8. Set the note's date using the user's local timezone and retain the actual created filename in every wikilink.
9. Update only the vault indexes/project note when the local workflow documents those files. Keep changes surgical.

## Required session sections

Keep these headings and their meaning stable for existing parsers:

- `# 작업 요약`: what changed, in 1–3 concrete sentences.
- `# 변경 파일`: files actually changed; write none when none changed.
- `# 중요한 결정`: decision, reason, rejected alternatives, and condition for revisiting it.
- `# 막힌 점 / 해결`: blocker, evidence, and resolution; distinguish unresolved items.
- `# 배운 점`: what was confirmed or changed in understanding.
- `# 다음부터 적용할 규칙 후보`: explicit, reusable candidates only; plain text `없음` when none.
- `# 승격 여부`: leave the parser-compatible section intact and record whether anything was manually promoted.

## Evidence discipline

- Label claims as confirmed, observed, inferred, or unverified when that distinction matters.
- Preserve source paths, commands, and test results as evidence, but redact secrets, tokens, and personal data.
- Do not turn a successful one-off workaround into a permanent rule.
- A session may produce no generalization or rule candidate. That is a valid result.
- Keep unrelated topics in separate notes; one explicit ingest event produces one note.

## Resume context

Add this subsection when work is incomplete:

```markdown
## 재개 지점

- 현재 상태:
- 다음 행동:
- 아직 확인하지 못한 것:
- 다시 볼 근거:
```

Report the created note path and any index paths changed. This skill records evidence; it does not promote rules automatically.

## Existing CLI integration

When the installed CLI supports the existing workflow, use `agent-memory init`
and `agent-memory log --agent <current-agent> --project "<project>" --summary "<summary>"`.
Verify supported agent identifiers rather than inventing one for jcode. If the
CLI cannot represent the current host, report that limitation or follow a
documented manual ingest path; never misattribute the session to Codex.
Enrich the actual printed file before changing `status: raw` to `status: enriched`.
Do not mark partial or unverified enrichment complete. Preserve existing
`# 변경 파일` evidence and `# 승격 여부` unless demonstrably incorrect.
Append one concise ingest entry to `wiki/log.md` linked to the actual filename;
update `wiki/index.md` and `wiki/projects/{project}.md` only for durable changes.
A retry must not append the same ingest entry again.

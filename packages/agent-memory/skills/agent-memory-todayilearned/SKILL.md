---
name: agent-memory-todayilearned
description: Write a date-scoped Today I Learned note for explicitly requested Agent Memory learning capture.
---

# Agent Memory Today I Learned

Use when the user explicitly asks for today's TIL or a daily learning note. Default to the current local date and timezone. This is a learning summary, not a duplicate session log.

## Workflow

1. Resolve the vault and date. Do not change the date merely because an older note was edited today.
2. Classify sessions by frontmatter `date:` first, filename date second, or explicit user context. Never use filesystem modification time as the actual-work date. An old session edited today belongs under `오늘 재정리한 과거 자료`, not `오늘 실제 작업`. Unknown work dates belong in `날짜 불명` and are excluded from `오늘 실제 작업` until dated evidence or explicit user context establishes the date.
3. Preserve manual writing and edit surgically. If there is one task, a table is optional; if there are multiple tasks, start with a compact summary table.
4. Use the short mode by default. Use detailed mode only when requested for teaching, a blog draft, or team sharing.
5. Link existing study notes first. If a foundational note is absent, record a `학습 질문` or short follow-up instead of creating a document automatically. Create a `wiki/cs/` note only when explicitly requested or genuinely needed for the current explanation.
6. Do not create `wiki/concepts/` here; record a follow-up candidate for `agent-memory-generalize` when a portable concept is warranted. Do not invoke it or save concepts without a user request covering that action.

## Short note shape

```markdown
# YYYY-MM-DD Today I Learned

## 핵심 배움

오늘 이해가 달라진 한 가지.

## 근거

- [[session note]] — 무엇을 확인했는가.

## 확인 질문

자료를 보지 않고 설명해 볼 질문.

## 다음 적용

어떤 작업에서 어떻게 써 볼 것인가.

## 아직 모르는 것

검증하지 못한 부분과 학습 질문.

## 오늘 재정리한 과거 자료

- [[older note]] — 오늘 한 처리.
```

For detailed mode, group each task under: `배경지식 (개념)`, `어떤 상황이었나`, `핵심 작업`, and `교훈`. Every claim should have a session/source link or be labeled as interpretation. Keep actual work distinct from retrospective editing.

Report the note path, date basis, linked evidence, and any follow-up questions. Never imply that a TIL entry proves a permanent rule.

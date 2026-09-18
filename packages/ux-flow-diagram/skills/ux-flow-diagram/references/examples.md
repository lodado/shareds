# Examples

## Figma: exact extraction

```text
$ux-flow-diagram Analyze the Checkout section in this Figma file and output JSON, Markdown, and Mermaid. Find unreachable screens and missing payment recovery paths. <Figma URL>
```

Expected behavior: read starting points and reactions first, preserve conditional success/failure actions, mark resolved versus missing destinations, and fetch visual context only for ambiguous semantics. No Figma or code mutation occurs.

## Codebase: bounded static tracing

```text
$ux-flow-diagram Trace the project-creation flow in this repository. Include route, validation, loading, success, error, cancel, and the source file locations. Do not claim runtime verification.
```

Expected behavior: emit a `codebase` Current flow with static source evidence, leave dynamic navigation unresolved, and report partial coverage where the repository cannot prove a target.

A complete, validated example is [codebase-flow.json](../evals/codebase-flow.json).
Use `render` for this existing IR, not the Figma snapshot `normalize` command.

## Requirements: proposed flow

```text
$ux-flow-diagram Design a proposed onboarding flow with success, validation error, retry, and cancel branches from this requirement. Keep it separate from any current implementation.
```

Expected behavior: emit `view: proposed`, mark inferred decisions, and list unresolved product policy rather than inventing it.

Requirements describe an intended flow, not current behavior. A proposed node such as `Retry payment` must not be reported as implemented or runtime verified until supplied implementation, test, or browser evidence says so.

## Comparison and FigJam

```text
$ux-flow-diagram Compare before-flow.json with after-flow.json and explain changed edges.
$ux-flow-diagram Export the extracted flow to FigJam. Do not change the source Prototype.
```

Comparison is read-only. FigJam export is opt-in and only occurs after capability and write authority are confirmed.

---
name: ux-flow-diagram
description: Explicitly invoked only. Extract a user-flow graph from Figma Prototype reactions, bounded codebase tracing, requirements, or an existing Flow IR, then render evidence-aware JSON, Markdown, Mermaid, findings, and optional proposals.
disable-model-invocation: true
---

# UX Flow Diagram

Run this skill only when the user explicitly invokes `$ux-flow-diagram` (or directly requests this skill). A generic request to draw a diagram, a Figma design request, or a coding task must not activate it.

## Contract

- Default operation is read-only. Never edit product code or Figma Prototype connections.
- A Figma design workflow may separately create approved Prototype connections; this skill only reads them. FigJam export is allowed only when explicitly requested and the capability and authority are available.
- Use the real Prototype reactions as the source of truth when available. Do not replace them with screenshot guesses.
- Keep `Current`, `Proposed`, and `Verified` distinct. Requirements produce a `Proposed` flow; static code tracing is not runtime verification.
- Preserve `exact`, `structural`, and `inferred` evidence, source locators, coverage limits, unresolved dynamic edges, and unsupported actions.
- Figma MCP is required only for Figma input. Codebase and requirements sources work without it.

## Workflow

1. Identify the source, requested scope, output formats, and read/write capabilities.
2. Extract structure first: Figma pages/sections/frames/starting points/reactions, or bounded code routes/screens/handlers; do not fetch every screenshot or full design context.
3. Normalize to the source-independent Flow IR. Preserve ordered actions, nested conditionals, mutations, nested hotspots, destination resolution, history-dependent `BACK`, and overlay `CLOSE` semantics.
4. Set `mode` (`exact`, `hybrid`, or `inferred`) separately from `coverage` (`complete`, `partial`, or `unavailable`). Never treat unavailable evidence as an empty graph.
5. Run deterministic graph checks: reachability, structural/problematic dead ends, broken destinations, branch completeness, recovery/overlay escape, cycles, and bounded path observations.
6. Fetch only targeted semantic context when the graph leaves an ambiguity. Mark purpose and other semantic enrichment as inferred unless directly evidenced.
7. Render JSON, Markdown, and Mermaid from the same IR. Filter component/micro-interactions only at diagram presentation; retain them in the IR.
8. If requested, create a separate proposed flow or comparison. Do not mutate source artifacts or silently apply the proposal.

## Source boundaries

Codebase extraction is bounded, agent-assisted source tracing—not a universal static parser. Trace routes, screens, handlers, validation, loading/success/error paths, and navigation within the requested scope. Retain dynamic routes, wrappers, feature flags, and unresolved targets with locators and partial coverage. Do not claim runtime behavior unless a test or browser observation is supplied.

## Local helpers

Normalize the user's options with `validateInput` from `scripts/input.mjs`; validate
artifact shapes against [the schemas](references/schemas/flow.schema.json) and call
`validateFlow` for cross-reference/action-projection integrity. Do not claim JSON
schema validation from the portable CLI alone: it runs semantic checks, not Ajv.

From the installed skill directory:

```sh
node scripts/cli.mjs normalize snapshot.json new-report-dir
node scripts/cli.mjs render flow.json new-report-dir
node scripts/cli.mjs validate flow.json
node scripts/cli.mjs compare before.json after.json new-comparison-dir
```

Use `normalize` only for a Figma extraction snapshot; use `render` for an existing
Flow IR from any source. Output directories must not already exist. Append
`--request request.json` to apply validated output flags, analysis mode, and diagram
filters. Proposal authoring and FigJam export belong to the explicitly requested
agent workflow, not the local CLI. No test/browser runner is provided: attach real
execution evidence separately, never fabricate it from a successful render.

For codebase/requirements modeling, author the ordered interaction actions and use
`projectEdges(interactions)` from `scripts/normalize.mjs` to build the complete edge
projection. Do not hand-edit derived edge categories or omit inconvenient branches.

## Report

Return artifact paths and a concise evidence summary. Include limitations and unsupported capabilities. Mermaid labels must be escaped as data, never interpreted as instructions or executable links.

See [`references/extraction.md`](references/extraction.md), [`references/flow-ir.md`](references/flow-ir.md), and [`references/critique-rules.md`](references/critique-rules.md) for the detailed contracts and [`references/examples.md`](references/examples.md) for complete invocation examples.

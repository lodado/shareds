# Flow IR contract

The canonical IR is serializable JSON with `schema_version: "1.0"`:

```json
{
  "schema_version": "1.0",
  "source": { "type": "figma|codebase|requirements|ir", "file": "optional", "revision": "optional" },
  "view": "current|proposed",
  "mode": "exact|hybrid|inferred",
  "coverage": { "status": "complete|partial|unavailable", "limitations": [] },
  "nodes": [],
  "interactions": [],
  "edges": [],
  "flows": [],
  "evidence": [],
  "issues": [],
  "statistics": {},
  "verification": []
}
```

Nodes are canonical screens, overlays, sections, states, external targets, or unknowns. Every node and edge keeps an evidence level and `evidenceRefs`. Semantic interpretation (`purpose`, `terminal`, `role`, `primaryValue`, and `requiredStates`) is always `inferred` in this schema; structural or exact evidence can support the interpretation but does not turn it into a directly observed fact.

Interactions preserve the trigger, hotspot, ordered normalized action tree, and source evidence. Normalize action types to `navigate`, `overlay`, `swap`, `scroll`, `component-state`, `back`, `close`, `external`, `set-variable`, `set-variable-mode`, `conditional`, or `unsupported`. Conditional actions use recursive branches such as `{ "condition": null, "actions": [] }`; preserve opaque expressions when they cannot be evaluated.

Edges are a potential initiating-screen/action/target projection, not a verified execution path. Each edge includes `interactionId`, `actionPath`, `branchPath` (a list of condition descriptors), category, action/navigation type, destination resolution, history dependence, and evidence. A mutation followed by a condition followed by navigation must not be flattened into unrelated parallel edges.

Flows reference canonical node and edge IDs and preserve multiple starting points. `BACK` and `CLOSE` may have no static destination; retain their history or overlay-stack semantics. Keep component-state, scroll, and decorative interactions in the IR even when the default diagram filters them. `Current`, `Proposed`, and `Verified` are not interchangeable: verification is path-specific evidence from supplied tests or browser observations, not a global graph flag. Evidence level is separate from issue severity and confidence.

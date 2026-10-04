# Formal-only reference loading and document discipline

Named conditional procedure links from shared roots resolve through the profile-aware loader.
For the original Formal targets at that trigger, use [Formal target index](../formal-reference-links.md).
This adds no all-phase prerequisite and never authorizes a Contract worker to read this manual.

Read after common and the applicable mandatory stack. These are shared mechanics, not a whole-run
operator manual. Load only the current role's procedure and applicable conditional nodes.

## Reference loading

References are nodes declared in [`reference-graph.json`](../reference-graph.json), which owns load
conditions: typed `route` rules are executable; uncompiled `when` rules remain manual. The selected
role procedure preserves the manual conditions at the decision point where they apply.
Before a scoped decision, model/package authoring, or protocol inspection, use the read-only router:

```sh
node scripts/oracle-reference-route.mjs --point <scope-decision|model-authoring|package-authoring|protocol-inspection> --json
```

At scope-decision, optional `--facts <json-file>` supplies architectureBoundaryChange (including state
ownership/public API), backendBoundaryChange (including DB/data-access), and performanceClaim (requirement
or improvement), each true, false or unknown. Missing facts load conservatively, false requires inspected
scope. Load returned references with dependencies, respecting reader ownership. Apply manualConditions
through the active role's conditional loads, using `--include <id>` to resolve manual-node dependencies.
Routing is partial, advisory, never permission or a substitute for entry, mode order or re-read rules.

Read `when` as the decision point, not the deliverable stage. If applicability is ambiguous, load.
Whether to skip a load is not a judgment call. The reads inlined into the selected role procedure and
the selected Delivery guide own execution order. A catalog does not authorize proceeding to a later step.
Reviewer-only reads belong in the independent review context, not the primary agent's context.
The controller may dispatch a role, but dispatch never waives an applicable mandatory obligation.

`bundles/` optionally joins nodes in dependency-first order with the same bytes and stable prefix.
Use a `-continued` bundle only when its header's assumed nodes are actually loaded in this context.
Fresh specialists cannot inherit a parent's assumed nodes. Otherwise read the full applicable bundle
or individual nodes. Report node ids, not the bundle id. Bundles are a delivery mechanism, never authority.
Never hand-edit bundles. Edit canonical references and regenerate with
`scripts/generate-reference-bundles.mjs`; `--check` detects drift.
Delivery bundles are entry only: common and delivery/ledger, not all later phases.
Do not load every future step or the controller's final-report template into every specialist.

When inspecting or changing the executable delivery protocol, read
[`delivery-protocol.md`](../delivery-protocol.md) for grammar, interpretation and limits.
[`delivery.protocol.json`](../delivery.protocol.json) is the machine-readable source of ledger edges,
target reference roots and conditional CLI input obligations. The closed oracle-delivery/v1 language is
compiled by oracle-protocol.mjs and used by oracle-run transition/status/guide. Predicates determine
required flags, not evidence validity. Runtime checks still own deep evidence, locks, TDD and independent
review at their rejection points. Human policy, source interpretation and design judgment remain in the
references. Bend verifies modeled product behavior, not the entire delivery process. The protocol grants
no filesystem permission and is not a claim of complete formal verification.

## Document-driven progress

At the start of each stage, re-read disk, not conversation memory. journal.md is append-only stage
rationale and is not duplicated into implementation-decision.md. The journal is neither a policy source
nor a lock target; the card governs implementation, but cannot erase contrary observations from the
journal. New evidence may reopen the problem definition, not authorize edits.
Write only what a later stage reads. The product's **test**/formal/ holds the .bend files, adapter,
generated model and tests, and BUGS.json beside MODEL.bend; the rest stays in .ai/oracles/<id>/.
Never save tool output to a file or keep a second copy (raw analyst output, duplicated package or
generated proof). Deterministic tools can be rerun; the journal records command and one-line result.
Preserve prescribed runtime evidence artifacts and raw reviewer inputs, not additional convenience copies.

People do not read run records. The one file written for a person is .ai/oracles/<id>/PLAN.md,
rewritten in place: goal, approved decisions, open questions, verification scope, next step, one line each.
Other run files serve the scripts; do not summarize them to the user unless asked. Reports carry no
screenshots or captures; a visual finding is one line naming the file.
Follow common's user communication contract, distinguishing fact, assumption and recommendation.
Human attention briefs lead with changed user outcome, linked evidence and unresolved decisions;
keep the full Draft/delta and independent reviewers' raw inputs intact.

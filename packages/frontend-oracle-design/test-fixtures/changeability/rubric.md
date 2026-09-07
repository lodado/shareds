# Predeclared pilot rubric

This is a small synthetic maintenance experiment, not a model benchmark or a universal architecture gate. One matched pair of executor agents implements both tasks under different criteria; no model/effort overrides or extra dependencies. The same executor-role instructions are a possible confound. Do not infer statistical significance, elapsed-time savings, token savings, or React/browser correctness.

## Assess without knowing the condition assignment

1. **Behavior:** all five controller-owned contract tests pass. Tests/criteria are unchanged by the executor. Existing error distinctions, cause identity, audit count, subscription count, idempotent cleanup, late-event suppression, and toggle behavior are preserved.
2. **Current boundary choice:** inspect actual source/diffs, not agent claims. Is SDK representation knowledge appropriately contained for this small feature? A local direct edit or mapper can be correct; an adapter is not automatically a win. Identify the actual transport and policy owners.
3. **No unnecessary abstraction:** the copy-only task should not introduce a new wrapper, state owner, interface, registry, or compatibility path. In the SDK task, judge whether new concepts hide real current complexity; module/file counts alone do not decide quality.
4. **Follow-up localization:** the controller will later change only the SDK amount representation, preserving all outputs. Describe the files and responsibilities actually modified in that second patch. Do not count test/document movement as harmful coupling or claim speedup from changed-line count.
5. **Outcome:** report each case as preserved / violated / unverified, cite source lines and test evidence, and list concrete trade-offs. A tie is a valid result. Flag insufficient evidence rather than favoring a larger diff or the new criteria.

The controller archives tasks, source snapshots, diffs, raw test output, test exit codes, and criteria hashes. Agent decisions are supplemental, not proof. A separate reviewer sees seed/source snapshots and tests without criteria or assignment metadata until the assessment is complete.

# Figma delivery dimension

Use the [game delivery schema/contract](../game-delivery.md), not an upstream frontend delivery schema. Report real Figma URL, file/page/frame/node identifiers, inspected states/viewports, source trace, overrides, critique and reaction readback.

`PILOT_READY`: scoped pilot only, actual editable artifact and inspection evidence.
`FIGMA_READY`: all agreed Figma scope has passed source, structure, visual re-review and applicable prototype readback; no open in-scope blocker or required unreviewed branch.
`INCOMPLETE`: partial artifacts or verification gaps.
`BLOCKED`: required permission/source capability unavailable.
`NEEDS_INPUT`: unresolved authorized direction needed.
`not_requested`: PLAN_ONLY; not a Figma failure.

Manifest checks can require locators and declared evidence but cannot independently verify them. Do not fabricate IDs to pass a schema. Source linkage, fidelity, content, layout and flow are separate checks. Evidence of an actual connection is not a game implementation, successful ad or usability result.

In this fork legacy Source Log names in retained references stay inside the Reference Log. Actual structured status is `readiness.figma`; planning remains independent. User acceptance requires a real user response/evidence locator.

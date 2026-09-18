# Prototype workflow — approved behavior, then readback

Use this workflow for new or behavior-changing interactive design. It is separate
from the independently callable `ux-flow-diagram` skill: this workflow creates and
checks approved Figma reactions while the diagram skill reads a prototype on demand.

## Before the first write

1. Derive the flow from the brief and HCI wireframe.
2. Identify only approved behavior: entry, primary success, validation/error recovery,
   cancel/back, and required overlay open/close paths.
3. Mark unresolved business rules (permissions, payment outcomes, server retries,
   destructive retention) as `proposed` or `unverified`; never invent them.
4. Keep static-only and small visual edits static. Do not add reactions merely because
   a button looks interactive.

## Write and preserve

Attach approved reactions to real hotspot nodes after the visual structure is ready.
Preserve existing reactions unless the approved scope explicitly changes them. Use the
official `figma-use` guidance, return every mutated node ID, and make no unrelated node
or page changes. A prototype connection is a Figma artifact; it is not a claim that an
API, database, or production router has been implemented.

## Readback gate

Immediately after prototype writes, reread each changed hotspot and record the source
screen and hotspot node, trigger, ordered action list, navigation semantic, destination
or history dependency, conditional branches, and unresolved destinations. Distinguish
`verified in Figma`, `not specified`, and `unavailable`.

Do not call the design complete when an approved core path is missing or when readback
cannot distinguish a missing destination from a permission/load failure.

## Completion boundary

Prototype readback verifies the editable Figma connection only. Browser behavior,
backend success/error handling, accessibility, and usability testing remain separate
verification activities. The result can later be read by the explicit `ux-flow-diagram`
skill; it is never silently converted into a diagram during design.

# Role reference loading and document discipline

Read after common and verification-common. Prerequisites: resolved profile, role, current stage and mode.
Unknown/bare roles return to the controller, never silently select a profile.

Use the canonical read-only router at the current decision point with the already resolved profile:
`scripts/oracle-reference-route.mjs --profile <resolved-profile> --point scope-decision --include <role-id> --json`.
Pass inspected scope facts, treating unknown conservatively. Read returned full same-profile dependency
closure with native Read without offset or limit. Keep source-code reads bounded. Router advice neither
advances stages nor authorizes excluded context. Unavailable routing is a blocker, not permission to
read another profile's procedures. Manual conditions apply only at the relevant decision point.

Shared role bodies own inputs, outputs and authority. Selected-profile additions own specialized procedure.
Named criteria links in shared root documents point here for resolution, not to a fixed profile manual.
Resolve that named graph node with the same explicit profile and current-stage applicability before reading.
Do not load every future phase, controller/reporting references into specialists, or reviewer-only
criteria into primary workers. Fresh workers cannot inherit a parent's continued-bundle assumptions.
Use continued bundles only for nodes actually read in the same context. Report actual node IDs, not
bundle IDs. Bundles are generated delivery copies, never authority. Do not hand-edit them.

Re-read disk at stage entry/resume. journal.md records rationale and command/result, not policy authority.
Keep existing runtime evidence and raw reviewer inputs, no duplicate convenience manuals or output logs.
PLAN.md is the human-facing goal, approved decisions, open questions, scope and next action.
Use the current Delivery guide for legal targets and missing current-step reads. Read protocol documents
only when inspecting/changing that protocol. Runtime evidence and transition gates remain authoritative.

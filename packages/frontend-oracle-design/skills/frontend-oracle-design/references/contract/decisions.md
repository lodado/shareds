# Frontend responsibility and realization decisions

At the current source/design/implementation boundary, use existing state/query/router/form owners,
derive computable flags and keep invariant calculations, coordination, external connections and
presentation responsibilities distinct. Read [state selection](state-ladder.md) for applicable async/type
boundaries. No new status union per screen, mirrored owner state or independent policy inferred from code.
Separate editable drafts from remote accepted data. Reset/remount/cancel/retry/order behavior is approved
policy, never a framework default. Prefer purpose-specific consumer seams over forcing unused capability.
UI stays declarative, micro-hooks own real effectful connections, domain hooks coordinate at meaningful
boundaries rather than one wrapper per handler. Domain/invariant owners precede folder/layer decisions.
Choose existing repo network/test boundaries, local handlers/data and approved dependency versions.
Record alternatives, actual ownership and walkthrough in existing architecture/implementation artifacts.
Realization names target, control, barrier and observations. Authoring proposals need source/approval,
implementation choices remain inside locked policy and after accepted VALID_RED. No unauthorized install.

# Frontend Code Authoring — component Boundaries·micro-hook·effect

Authority·policy sources·prior investigation·state ownership·execution location·loading boundaries
are owned by [`frontend/decisions.md`](decisions.md). This document only adds the authoring
boundaries for porting those decisions into code. Design Intent implementation·performance·quality
gates are owned by [`frontend/quality.md`](quality.md).

## 1. Respect Architecture Units and Code Boundaries

- If the existing repo architecture is consistent, preserve it and do not slip in an FSD migration.
- In greenfield or approved FSD, read all of [`fsd.md`](../fsd.md) and respect the layer
  direction·segment rules·slice public API contract. Do not create layers·segments that are not
  used.
- If it is not FSD, apply the existing repo architecture documents·import conventions as they are.
  Inventing a new profile·migration during implementation is forbidden.
- Split a component when state ownership, async/error boundary, accessibility responsibility, or the
  reason for independent testing·reuse differs. By default one exported component per file, with
  small private JSX helpers allowed. Splitting by LOC alone or a prop-forwarding wrapper is
  forbidden.
- Direct network calls from a component are forbidden. transport·DTO adapters belong to the approved
  api/network boundary, and query key/options·domain selectors are owned by the model boundary.
- Separate the client·server public APIs so that server-only code does not leak into the client
  graph.

## 2. Set Declarative UI and micro-hook Boundaries

A component declares the UI for the current state and the user intent, and does not manipulate the
DOM imperatively. Rather than creating impossible combinations with several independent booleans,
keep the minimal state that expresses the actual UI state. For state derivation·exhaustiveness of
async·multi-step flows follow [`types/state-ladder.md`](../types/state-ladder.md), and add a new
state-machine dependency only when the need is proven.

A micro-hook is not **short code** but a **small ownership boundary**. UI and business logic
responsibilities:

- A UI component owns only semantic JSX, accessibility, visual state expression, view-local interaction, and conveying user intent. It does not own domain judgment, DTO conversion, query/cache, or navigation·storage·observer coordination.
- A micro-hook owns only one interaction workflow or the connection between one external system and the React lifecycle. It does not own JSX·class·token·copy, or a bundle of unrelated workflows.
- A pure model function owns only React-independent business rules such as filter·group·sort·validation·state transition. It does not own hook lifecycle or screen presentation.

A Page composes micro-hooks and draws the UI from render-ready values and intent actions. When an
event handler grows a domain branch or an ordering of two or more side effects, a hook owns the
workflow, and computation that does not need React goes into a pure model function.

- If it owns one interaction workflow or an external system synchronization, split it into a hook.
- A hook **returns state and actions as siblings** (`{ state, retry }`). Do not put actions into the
  state value, and for server state re-expose the query's `refetch` instead of a new action. Do not
  fill in no-op actions for things it cannot do.
- query key/options·remote operations belong to the corresponding server-state boundary.
- A view focuses on rendering·expressing accessible interaction and receives data/actions.
- Express pure computation as a function or during render. Use `useMemo` only when it is an
  optimization with real cost.
- Creating a hook/file for a one-line `useState` used once, a simple rename, or a JSX fragment is
  forbidden.
- Do not merge unrelated query·form·modal state into one large hook return object.
- Implementation choice order: `pure function → render derivation → event handler → framework/query
API → effect`. effect is the last resort on this ladder.
- **The data flow must be readable inside the render.** Run the result of a user action
  synchronously in that action's event handler — the moment an effect subscribes to a state change
  and reacts, cause and effect hide between render cycles and you can no longer trace where a
  value changes. Make it flow in one direction: `event → pure computation → state update → render
derivation`.
- Use an effect only for synchronization whose external system·reason·cleanup are recorded in the
  architecture document (DOM measurement, subscriptions, non-React widgets, analytics). prop/state
  derivation, event handling, manual refetch instead of a query key, and two-way URL↔local state
  sync are forbidden.
- **effect chains are forbidden.** A chain where setState wakes another effect that calls setState
  again is the same data splitting across multiple renders — merge it into one pure function or
  push it down into an event handler. Reset state on a prop change with `key`, not with an
  effect.

### Effect Lint Gate — Only When the Conditions Match

Derived state·effect chains·event replacement can be judged mechanically by lint. The procedure is
the same as the Hook Encapsulation Gate — reusing the repo's existing rules comes first, and
introducing a plugin·changing config happens after user approval and is recorded in the architecture
source, never added silently.

1. A repo using `@lodado/eslint-config/react` already has it on —
   `react-hooks/set-state-in-effect`·`set-state-in-render` (synchronous setState inside an effect,
   the starting point of derived state and chains) and
   `react-you-might-not-need-an-effect` strict
   (all rules as errors, including
   `no-derived-state`·`no-chain-state-updates`·`no-event-handler`·`no-adjust-state-on-prop-change`)
   correspond to the forbidden list above.
2. For other repos, propose introducing `eslint-plugin-react-hooks` 6+ (4.x has only
   `rules-of-hooks`·`exhaustive-deps` and cannot catch these) and
   `eslint-plugin-react-you-might-not-need-an-effect`. Because flat config allows only one instance
   per plugin name, a repo that composes them by hand defines the shared plugin reference in exactly
   one place.

lint catches only the **shape** of an effect. Whether a remaining effect is really an external
system synchronization, and whether it has a reason·cleanup, is judged by the reviewer.

### Hook Encapsulation Gate — Only When Approved

Apply a deterministic lint gate to the Page/UI target glob only when the architecture document has
explicitly chosen `orchestration-only`. Do not select it automatically by LOC or effect count.

1. If the repo has an ESLint rule that enforces the same boundary, reuse it.
2. Only when there is no equivalent rule, propose introducing
   `use-encapsulation/prefer-custom-hooks` from `eslint-plugin-use-encapsulation`.
   Installation·config changes are recorded·locked in the architecture source after user approval,
   and silent addition is forbidden.
3. Pin the target glob, rule ID, `allow`, `block`, lint command, and config source together with the
   actually installed version. **Name explicitly** render-local primitives in the approved `allow`,
   and external orchestration hooks such as lifecycle·navigation·query·form in the approved `block`.
   Do not assume the plugin's default list or automatic recognition of the latest React/Next hooks.
4. Run the pinned lint command with `oracle-run.mjs exec --label hook-encapsulation`, and after
   GREEN·independent review re-run it with the same required label.

This gate proves only the structural fact that there is **no direct call** to a forbidden hook. It
does not prove the responsibility cohesion or behavioral correctness of the extracted hook, so
trivial wrappers, hooks that hide UI presentation, and giant hooks that merge unrelated
responsibilities are judged separately by tests and an independent reviewer.

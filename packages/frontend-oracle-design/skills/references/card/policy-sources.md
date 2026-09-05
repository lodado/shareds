# Oracle Card — external standards and policy sources

## External standard gate

Before Risk·Grill, find and read in full every material the user provided or the repo designated as
an approved standard. Priority and jurisdiction rules follow the authority priority in
[`common.md`](../common.md) — production code·existing tests·browser observation are investigation
evidence only, not policy sources.

Record this change's product outcome and scope at the top of the card. If there is no KPI, write a
success outcome the user can observe instead of inventing numbers.

```markdown
## Outcome Brief

- Actor and context: who uses it in what situation
- Observable success: the observable success outcome
- Non-goals: what this change will not do
- Worst regression: the worst damage from a false GREEN
- Reversibility: how to revert, or the N/A reason
- Sources: S1, S2
```

### Requested mechanism check — separating mechanism from outcome

When the user requested a concrete mechanism (screen·field·button·automation·condition) but the
intended outcome or the user is unclear, record the following in the Outcome Brief as well. When
mechanism and outcome already match, proceed without this subsection.

- Requested mechanism: the concrete mechanism the user requested
- Intended outcome: the user·business problem actually being solved
- Smallest reversible scope: the smallest reversible scope that can confirm that outcome
- Deferred scope: scope that will not be built before verification — record it in Non-goals with the
  reason

Rules:

- Smaller alternatives are only presented in the Draft Oracle. Scope reduction is finalized only by
  the user's explicit approval, and the agent never shrinks it at will.
- Do not use this review as grounds for skipping a `mandatory-constraint`
  (security·privacy·legal·accessibility·data integrity).

## Source Registry

```markdown
## Source Registry

| ID  | Kind                 | Jurisdiction              | Standard      | Location·version                  | Approval status |
| --- | -------------------- | ------------------------- | ------------- | --------------------------------- | --------------- |
| S1  | product-policy       | Business outcome          | PRD           | repo:docs/profile.md#save-flow-v3 | approved        |
| S2  | product-policy       | UI·copy·interaction       | Figma         | file/page/frame/version           | approved        |
| S3  | project-constraint   | payload·error·idempotency | API contract  | endpoint/version                  | approved        |
| S4  | mandatory-constraint | accessibility·tokens      | Design system | doc location/version              | approved        |
```

The four allowed `Kind` values:

- `product-policy`: material that decides product outcomes, such as user answers and approved
  PRD·Figma
- `mandatory-constraint`: constraints that a product preference cannot lower, such as
  security·privacy·legal·accessibility·data integrity
- `project-constraint`: the repository's public API·architecture·test·compatibility contracts
- `implementation-reference`: official docs·implementation heuristics for the actually installed
  version. It cannot decide product outcomes.

Rules:

- A Source ID must be unique within the card. Every `S*` cited by a policy·Outcome Brief·`O*`/`D*`
  row must exist in this table.
- For approved documents·architecture·API contracts inside the repo, record `Location·version` as
  `repo:<relative-path>#<anchor-or-version>`. A `repo:` source must also be included in
  `oracle-lock.mjs create --source <relative-path>`, and locking is forbidden when it is missing
  from the lock manifest.
- For Figma, directly confirm the exact page·frame·variant in the original file. When it cannot be
  opened, do not substitute memory·similar screenshots.
- When there is no external standard, record `N/A — no provided or approved external standard`.
- A conflict between external standards or with a user answer, or an inaccessible required standard
  → present the conflict location·affected policy, then `NEEDS_DECISION`.
- The card is an executable translation of the external standard. After writing it, cross-check that
  the external standard's state·copy·interaction·side-effect requirements were not
  omitted·distorted.
- A standard takes precedence only within its own jurisdiction ([`common.md`](../common.md)
  jurisdiction rules). `mandatory-constraint` conflict handling also follows the same document.
- When a standard's revision/version changes, invalidate the existing `ORACLE_READY` and cross-check
  again.

## Dependency landmines — importing upstream escapes

A library's caveat docs, its issue tracker, and above all its **problem-avoidance options are
fossils of escapes upstream already paid for** — an option like `initialOffset` exists because
someone shipped the scroll-reset defect it prevents. Read the fossils before the lock instead of
rediscovering the defect in production.

When the Source Registry registers an `implementation-reference` dependency that this change newly
adopts or whose usage surface it changes, collect — for the actually installed version — ① the
official docs' caveat·gotcha·pitfall sections, ② the option list, flagging options that exist to
avoid a known problem, ③ top open·closed defects in the issue tracker that touch the used surface.
Record them as a card section per package:

```markdown
## Dependency landmines — example-virtual-list

| Landmine                                            | Citation                | Disposition                                                                       |
| --------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| initialOffset option = fossil of mount scroll reset | docs/api#initialoffset  | needs-decision: keep scroll on remount?                                           |
| measureElement remeasures on dynamic row height     | docs/api#measureelement | N/A: fixed row height (S2)                                                        |
| scrollMargin ignored before first measure           | issues/812              | needs-evidence: is the list inside a scrolling ancestor — code(src/list/Grid.tsx) |
```

Rules:

- **Every landmine needs a citation** — a docs anchor, issue URL, or changelog entry.
  LLM-recalled pitfalls without a citation are rejected by lint (`landmine-citation-missing`):
  unconstrained recall produces majority false positives, and a citation is the constraint.
- Every row carries one of the four dispositions (`covered(O*/D*)` / `impossible: mechanism —
witness` / `needs-decision: question` / `needs-evidence: fact — lookup`) or a sourced `N/A`;
  an empty one fails lint (`landmine-undispositioned`). Grammar and witness rules are the sweep's
  ([`interaction-sweep.md`](interaction-sweep.md)). Promotion follows the sweep rule — only
  `needs-decision` becomes a grill question; `needs-evidence` is investigated in the same pass.
- A card that adopts no dependency and changes no dependency surface has no landmine section —
  do not manufacture one.
- At lock time, pass each landmine-swept package to `oracle-lock.mjs create --dep <name>`; the
  lock records the installed version. After the lock, `oracle-verify.mjs sources --lock <path>`
  compares locked versions against the currently installed ones and reports `ASSUMPTION_DRIFT`
  per changed package — a drifted card re-runs the landmine sweep in a new revision instead of
  trusting stale fossils.

## Policy sources

The accepted·not-accepted list is canonical in the policy sources section of
[`common.md`](../common.md). Attach a source to every decided policy — if even one policy lacks a
source, it is not `ORACLE_READY`. The source must be a registered `S*` or `User Confirmation`, and
an unapproved source or an `implementation-reference` alone is not policy authority.

```markdown
### Decided policies

- P1: Additional submits during save are ignored. (source: user Q1=A) (rows: O1, O2)
- P2: On a 5xx failure the input is preserved. (source: S1) (rows: O3)
```

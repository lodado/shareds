# Oracle Card — Risk judgment and policy Grill

## UI design intent gate

For a new UI·redesign, or a change to visible layout·palette·typography·copy·motion·responsive
behavior·visual identity, read all of [`visual-design.md`](../visual-design.md) before writing the
card — the three visual scopes, the Design Proposal rules, the Design Change Confirmation gate, and
the `HARD`·`RELATIONAL`·`JUDGMENT` evidence tiers are owned by that document. Work that preserves
the existing visual outcome records only `behavior-only` and the N/A reason. For
`local`·`identity-shaping`, include the approved Design Intent and the `D*` rows in the same card,
and do not lock before the explicit confirmation of Design Change Confirmation (`NEEDS_DECISION`).

Visual scope does not replace functional Risk. Record the two judgments separately.

## Risk judgment

Judge by the **worst damage from a false GREEN**, not by code complexity. Even when the UI is
simple, it is High if the side effects are dangerous.

- Low (static display, pure synchronous helper) → the card may be skipped — record risk and reason
  in one line
- Medium (read, search, form, cache) → write the card
- High (payment, order, save, delete, permission, external mutation) → write the card + user card
  confirmation required

## Policy Grill — system design interview

Ask **only questions whose answer changes the expected outcome or the test**.

- 3~5 per round, at most 2 rounds
- Attach a recommendation and its rationale to every question
- Do not ask when the repo docs·approved specs already answer it
- A recommendation is not a decision, and is never applied as a default when there is no answer
- If questions that change the outcome remain after 2 rounds, `NEEDS_DECISION`

### Phase order

Order the questions so that **an earlier answer kills a later branch**. Before asking, explore the
repo·PRD·Figma·API docs first and remove the questions that already have answers. An answer obtained
by observing code is only a `project-constraint` candidate, not a product policy source.

- P1 outcome: actor·situation, observable success, non-goals, worst regression·reversibility, platform·device·offline·multilingual → Outcome Brief
- P2 side effects·risk: whether server state changes, money·data·permission damage → Risk lane
- P3 data·architecture: source of truth, stale tolerance, existing state owner (query·router·form), core entities and owning components → architecture intake, State ownership
- P4 API contract: spec source location·version, UI outcome·retry per error code, who owns the idempotency key, pagination end judgment → Source Registry, the `API contract` section
- P5 concurrency·async: the "frequently needed questions" below → card `O*` rows
- P6 state model: number of states·impossible transitions → State Model (opt-in)
- P7 visual: visual scope, loading·empty·error display, accessibility check → Design Intent·`D*` rows
- P8 performance·operations: performance target numbers·measurement method, rollout·flag → performance gate

Pruning:

- When P1 judges Low, end the grill and route to the
  [`lanes/low-fast-path.md`](../lanes/low-fast-path.md) lane.
- Skip P4 entirely when there is no endpoint, P5 when there is no mutation·async, P7 when it is
  `behavior-only`, and P8 when there is no performance claim.
- When the feature matches an installed `frontend-system-design` reference, convert that document's
  decision points into P4·P5 questions and replace the generic questions.
- When there is no API spec source, do not fill P4 with guesses. Instead derive a draft schema from
  the card rows and present it together with the Draft Oracle; on explicit approval, register it as
  a `project-constraint` source and lock it together. Without approval, `NEEDS_DECISION`.

Round composition: Round 1 = surviving P1~P3 questions, Round 2 = surviving P4~P7 questions. **When
5 or fewer surviving questions remain after pruning, bundle the two rounds and throw them at once**
— the only reason to split rounds is that an earlier answer kills a later branch, and with no branch
to kill it only adds round trips. However, do not bundle when the content of a later phase question
itself depends on an earlier answer. When the user explicitly requests a one-question-at-a-time
interview (e.g. "grill me"), proceed in phase order without a round cap, for Design-only
investigation only. Policy questions during Delivery still follow the 2 rounds of
`oracle-run.mjs budget`.

At the end of each round, append the questions·answers·whether the recommendation was adopted and
the pruning reasons to `.ai/oracles/<oracle-id>/journal.md`. Do not leave answers only in the
conversation — even when context is summarized, the next stage continues from the journal and the
card.

Write each Q&A entry in the one-line format — it is incomplete when the question·answer·adoption·mapped row is missing:

```markdown
## Grill Round 1 (P1~P3) — 2026-08-21

- Q1(P1): success criteria? → answer: completion screen+order number → adopted: recommendation accepted → rows: P1, O1
- Q2(P4): UI outcome for 409? → answer: move to the existing order screen → adopted: modified → rows: P3, O5
- Pruning: P7 skipped — behavior-only
```

Frequently needed questions (P5):

- Whether a duplicate submit during pending is ignored, queued, or treated as an error
- Whether input·existing data is preserved after a failure
- Whether retry is allowed per error subtype
- Which outcome wins when B is requested after A and A responds after B
- How a late response after leaving·cancelling is handled
- How retry and idempotency are guaranteed on an outcome-unknown timeout
- Whether the requested mechanism is the smallest one that achieves the intended outcome, and whether a smaller alternative should be verified first

Method rationale: the phase order follows the R→A→D→I→O order of the
[RADIO framework](https://www.greatfrontend.com/front-end-system-design-playbook/framework), and the
separation of questions·policies·examples follows the rule(=`P*`)·example(=`O*`)·question(=red card)
correspondence of [Example Mapping](https://cucumber.io/blog/bdd/example-mapping-introduction/). An
example whose `Then` is unclear is a question — do not create a row, record it as a red card. When
red cards pile up, `NEEDS_DECISION`; when rules pile up, propose splitting the Smallest reversible
scope.

Where each RADIO element is handled — the grill does not own all of them:

- R Requirements: Grill P1·P2
- A Architecture: the Delivery architecture gate — do not ask about implementation structure in the grill
- D Data model: Grill P3
- I Interface (server): Grill P4 → without a spec, a draft derived from the card → approval → `## API contract`
- I Interface (component): [`types/state-ladder.md`](../types/state-ladder.md) — derived from the card `O*` rows
- O Optimizations: P5 concurrency·P7 accessibility·P8 performance + Delivery evidence rows

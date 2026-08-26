# UI visual design intent contract

Read this only when newly creating visible UI or changing layout·palette·typography·copy·motion·
responsive behavior·visual identity. A behavior-only task that keeps the existing visual contract
as-is records only the visual scope and the N/A reason and does not expand this procedure.

## 1. Authority and visual scope

Only approved specs·brand·design system·Figma·content guide and the user's explicit answers are
sources of visual policy. Each material counts only within its own jurisdiction — Figma decides
layout·copy·interaction but cannot decide API idempotency, and the API contract is the reverse.

An AI visual direction and the output of the available `frontend-design` skill are a **Design
Proposal**, not a policy source. Load the `frontend-design` skill only when an identity-shaping
proposal is actually needed. If the proposal changes the outcome, do not lock it before the Design
Change Confirmation and stop with `NEEDS_DECISION`.

A mismatch with an approved visual requirement is `PRODUCT_DEFECT`, and an omission on the card is
`POLICY_GAP`. Only a reviewer's sourceless personal taste is `NON_ORACLE_OPINION`.

Record one visual scope on the Oracle Card:

- `behavior-only` — keeps the existing component·token·visual outcome as-is: record the whole design plan as N/A with a reason
- `local` — changes part of an existing screen's state·copy·hierarchy·reflow: reuse the existing design system, contract only the affected axes, then explicit user confirmation
- `identity-shaping` — a new page·large-scale redesign·a key screen that creates the brand impression: lock the whole Design Intent through the two passes below and explicit user confirmation

Visual scope and functional Risk are separate. Even a simple screen can be High risk if it is a
dangerous mutation, and even identity-shaping work is judged by the existing Risk rules when the
side-effect damage is small. Record the two judgments separately.

## 2. Design Proposal and Design Change Confirmation

If the approved criteria are sufficient, translate them as-is into an executable contract. Propose
only for identity-shaping work whose criteria are insufficient:

1. Decide the subject, the audience, and the page's single job concretely.
2. Derive the visual direction from the subject's actual material·language·tools·structure.
3. Propose color·type·layout·signature·copy·motion as one bundle.
4. Fix, through a genericity self-review, choices that would paste onto another product unchanged.
5. Present the revised proposal and the discarded alternatives to the user.
6. Register only the approved answers in the Source Registry and lock them into the Design Intent.

Do not apply an agent recommendation as a no-response default. If approved criteria conflict or an
outcome-changing axis remains, present the current proposal and the questions, then `NEEDS_DECISION`.

### Design Change Confirmation — required gate

When changing a visible design outcome such as `local`·`identity-shaping`, you must show the
following and get explicit user confirmation before the Oracle lock·tests·production modification:

1. the palette·type·layout·copy·motion·responsive·signature axes that change from the current outcome
2. the approved source and the new Design Intent
3. the existing elements to keep and the discarded alternatives
4. the outcomes that differ across viewport·theme·reduced-motion

An approved Figma·PRD·design system is a source for the change direction but does not substitute for user confirmation.
A blanket "redesign" or "make it prettier" request is also not an approval of a concrete Design
Intent. A previous user message can be used without re-asking only when it is **an answer that
explicitly confirmed the entire presented Design Intent**.

Record on the card the message position of the confirming answer or an identifiable quotation. If
there is no response or only some axes are approved, print the current card and the remaining
questions, then `NEEDS_DECISION`. `behavior-only` records this gate as N/A.

## 3. Design Intent format

The Design Intent and the Visual Contract are included in the **same Oracle Card bytes**, not in a
separate temporary file. Lock approved local design material together with
`oracle-lock.mjs --source`, and for a remote Figma·URL record the exact
file·page·frame·version on the card.

```markdown
### Design Intent

- Visual scope: behavior-only | local | identity-shaping
- Subject:
- Audience:
- Single job:
- Visual thesis:
- Signature element:
- Deliberate aesthetic risk:
- Restraint:
- Voice and canonical vocabulary:
- Approved references:
- Rejected generic direction:
- Design Change Confirmation: user answer position or behavior-only N/A

### Visual Contract

| ID  | Policy | Axis       | Contract | Never | Source    | Evidence tier |
| --- | ------ | ---------- | -------- | ----- | --------- | ------------- |
| D1  | P1     | copy       | ...      | ...   | S1        | HARD          |
| D2  | P2     | responsive | ...      | ...   | S2        | RELATIONAL    |
| D3  | P3     | identity   | ...      | ...   | user Q1=A | JUDGMENT      |
```

For `behavior-only`, only a sourced N/A that keeps the existing contract. For `local`, only the
affected axes. For `identity-shaping`, decide all of the items below or leave an N/A reason:

- the palette and semantic token roles
- the display·body·utility typography roles and the actually available fonts
- layout hierarchy, reading order, responsive reflow
- the label·divider·numbering that expresses the information structure
- the canonical copy of primary action, loading, error, empty, success
- one signature element and the restraint around it
- motion's purpose·trigger and the reduced-motion substitute
- the repo accessibility contract such as focus·contrast·keyboard·overflow

Do not put implementation classes·component trees·arbitrary pixel values into the contract unless they are a policy outcome.

## 4. Evidence tiers

One primary evidence tier per `D*` row. Add secondary evidence to the evidence mapping but do not
inflate it as a count of independent evidence.

- `HARD` — exactly determinable copy·role·focus·theme·reduced motion·overflow·token outcomes: component test, Playwright, DOM/a11y, computed style
- `RELATIONAL` — hierarchy·reading order·reflow·visual relations between elements: a real browser, bounding box, comparison against the approved frame, screenshot
- `JUDGMENT` — subject distinctiveness·typography character·signature·restraint·voice: a user or an independent designer review that looks at the approved brief and screenshots

- Do not couple `HARD` to internal class names or a full DOM snapshot.
- Do not turn `RELATIONAL` into the exact coordinate of every pixel.
- Do not pass `JUDGMENT` without a source merely because it cannot be automated.
- Do not adopt a current production screenshot as a golden image without approval.
- Do not report evidence that shares the same fixture·mock·reference as independent of each other.

## 5. Baseline authority and external Visual QA handoff

A visual baseline is not an auto-generated output but a policy source approved by the user. To
create or change a baseline, show the user the before/after difference, the target
viewport·theme·motion and the tolerance, get **explicit approval**, and then record it in a new
Oracle revision. Do not overwrite the existing revision.

Screenshot comparison and runs where a person enters the browser directly are owned by the separate
`$frontend-visual-qa`. Neither this skill nor `$test` runs them implicitly on its behalf. If there
is a `RELATIONAL` row, obtain `Visual QA authorization: approved | declined` together at card
approval. Treat `approved` as an explicit request and invoke it by name, and for `declined` leave
that row as the visual owner's `pending`.

In a `local`·`identity-shaping` change, if a UI-shaping interaction, a `RELATIONAL` row, or a
`JUDGMENT` row depends on real screen context, require one browser journey before review. Do not add
a new dependency; use only one of the Playwright/Storybook/browser MCP/Figma handoff that already
exists in the target repo. If no tool is installed or the user declined, leave that row only as
`pending` or a sourced N/A. The Low fast path escalates to the Oracle lane the moment this condition arises.

`$frontend-visual-qa` returns only the following:

- the cited Oracle revision and the approved baseline
- PASS·FAIL·N/A per requested D/O row
- the environment and the artifact paths
- `NEEDS_DECISION` if policy is needed, `FAIL` if the execution environment is broken

An external visual QA artifact is the Oracle's secondary evidence. It does not create a new Delivery
state or substitute for `IMPLEMENTED_GREEN`·`REVIEW_VERIFIED`. Even if visual QA finds a product
defect, it does not fix production directly but returns it to this skill's `VALID_RED` flow.

## 6. Two design passes

### Pass 1 — subject-based plan (`identity-shaping` only)

- **Color:** the existing design system first. For a new identity, 4~6 named colors and semantic roles.
- **Type:** display·body·utility roles, and confirmation of the actual installation·license·loading·fallback.
- **Layout:** the information hierarchy in one sentence and a small ASCII wireframe.
- **Signature:** only one element that will make this screen memorable.
- **Risk:** justify only one visual risk that does not harm accessibility·usability.
- **Motion:** prioritize one moment that aids understanding, and avoid scattered effects.
- **Copy:** nouns the user recognizes and active verbs, with consistent action→pending→success vocabulary.

### Pass 2 — genericity and restraint critique

Review before locking and record the choices you revised and why:

1. Could the palette·type·layout be pasted unchanged onto a completely different product?
2. Is the hero or the first screen the subject's thesis, or a template-style big headline?
3. Do the numbering·divider·eyebrow express the real information structure?
4. Do decorations·motion other than the signature compete for attention?
5. Is the copy the user's language, or internal implementation jargon?
6. Would removing one element make it clearer?
7. Does the direction hold up with real content, long strings, and empty·error states?

## 7. Delivery evidence responsibility

- A `HARD` row confirms `Then`·`Never` together at the narrowest DOM·a11y·component observation tier.
- A `RELATIONAL` row maps to a `$frontend-visual-qa` artifact or the same owner's `pending`. A
  `pending` and a user `declined` may remain at `IMPLEMENTED_GREEN` but block `REVIEW_VERIFIED`
  without a source-backed N/A revision.
- A `JUDGMENT` row delivers the approval criteria and the Design Intent to an independent `designer`.
  The reviewer does not create new policy. If the designer review is pending, it blocks
  `REVIEW_VERIFIED` without a source-backed N/A revision.
- A row's primary owner: `HARD → test`, `RELATIONAL → visual`, `JUDGMENT → designer`. A sourced
  `N/A` is possible at any tier.
- Do not add a state to this skill for an external visual QA result.

Feedback uses the canonical router in [`common.md`](common.md) as-is — visual jurisdiction mapping:

- mismatch between the approved Figma·Design Intent and the actual UI → `PRODUCT_DEFECT`
- a source's visual requirement is missing from the card, or sources conflict → `POLICY_GAP`
- wrong viewport·font fixture·screenshot conditions → `HARNESS_DEFECT`
- judgment impossible due to a tool·font asset·browser startup problem → `ENVIRONMENT_DEFECT`
- missing visual evidence within the card scope → `EVIDENCE_GAP`
- sourceless reviewer taste → `NON_ORACLE_OPINION`

## 8. Prohibitions

- forcing a new palette·font·signature plan on every UI change
- locking a reviewer's or an agent's proposal into the Oracle without approval
- reducing design quality to a single unsupported score
- approving the current implementation screenshot as an automatic golden
- coupling the contract to a full DOM snapshot·class names·every pixel coordinate
- adding a new design system·animation dependency·icon library by default in the name of distinctiveness
- adding multiple signature elements and scattered animation
- sacrificing accessibility·performance·responsive fundamentals to an aesthetic risk
- putting screenshots·direct browser runs back into this skill or `$test`

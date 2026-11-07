# UI visual design contract

Read this only when newly creating visible UI or changing layout·palette·typography·copy·motion·
responsive behavior·visual identity. A behavior-only task that keeps the existing visual contract
as-is records only the visual scope and the N/A reason and does not expand this procedure.

## 1. Authority and visual scope

Only approved specs·brand·design system·Figma·content guide and the user's explicit answers are
sources of visual policy. Each source counts only within its own jurisdiction — Figma decides
layout·copy·interaction but cannot decide API idempotency, and the API contract is the reverse.

An AI visual direction and the output of the available `frontend-design` skill are a **design
proposal**, not a policy source. Use that skill only when an identity-shaping proposal is actually
needed. If the proposal changes the outcome, do not apply it before the design change confirmation
below; ask the user.

A mismatch with an approved visual requirement is a defect, and an omission in the requirements is
a question for the user. A reviewer's sourceless personal taste is only an opinion.

Record one visual scope:

- `behavior-only` — keeps the existing component·token·visual outcome as-is: record the whole design plan as N/A with a reason
- `local` — changes part of an existing screen's state·copy·hierarchy·reflow: reuse the existing design system, specify only the affected axes, then get explicit user confirmation
- `identity-shaping` — a new page·large-scale redesign·a key screen that creates the brand impression: decide the whole design brief through the two passes below and get explicit user confirmation

Visual scope and functional risk are separate. Even a simple screen can be high risk if it is a
dangerous mutation, and even identity-shaping work is low risk when the side-effect damage is
small. Judge the two separately.

## 2. Design proposal and design change confirmation

If the approved criteria are sufficient, translate them as-is into an executable contract. Propose
only for identity-shaping work whose criteria are insufficient:

1. Decide the subject, the audience, and the page's single job concretely.
2. Derive the visual direction from the subject's actual material·language·tools·structure.
3. Propose color·type·layout·signature·copy·motion as one bundle.
4. Fix, through a genericity self-review, choices that would paste onto another product unchanged.
5. Present the revised proposal and the discarded alternatives to the user.
6. Record only the approved answers in the design brief.

Do not apply an agent recommendation as a no-response default. If approved criteria conflict or an
outcome-changing axis remains, present the current proposal and the questions, then wait.

### Design change confirmation — required gate

When changing a visible design outcome in a `local` or `identity-shaping` task, show the following
and get explicit user confirmation before modifying production:

1. the palette·type·layout·copy·motion·responsive·signature axes that change from the current outcome
2. the approved source and the new design brief
3. the existing elements to keep and the discarded alternatives
4. the outcomes that differ across viewport·theme·reduced-motion

An approved Figma·PRD·design system is a source for the change direction but does not substitute for user confirmation.
A blanket "redesign" or "make it prettier" request is also not an approval of a concrete design
brief. A previous user message can be used without re-asking only when it is **an answer that
explicitly confirmed the entire presented brief**.

Record the message position of the confirming answer or an identifiable quotation. If there is no
response or only some axes are approved, show the current brief and the remaining questions and
wait. A `behavior-only` task records this gate as N/A.

## 3. Design brief format

Keep the brief next to the other requirements, in one place the reviewer can find. For a remote
Figma·URL source record the exact file·page·frame·version.

```markdown
### Design brief

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
- Design change confirmation: user answer position or behavior-only N/A

### Visual requirements

| ID  | Axis       | Requirement | Never | Source    | Check type |
| --- | ---------- | ----------- | ----- | --------- | ---------- |
| D1  | copy       | ...         | ...   | spec §2   | HARD       |
| D2  | responsive | ...         | ...   | Figma     | RELATIONAL |
| D3  | identity   | ...         | ...   | user Q1=A | JUDGMENT   |
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

## 4. Check types

One primary check type per requirement. Add secondary evidence but do not inflate it as a count of
independent evidence.

- `HARD` — exactly determinable copy·role·focus·theme·reduced motion·overflow·token outcomes: component test, Playwright, DOM/a11y, computed style
- `RELATIONAL` — hierarchy·reading order·reflow·visual relations between elements: a real browser, bounding box, comparison against the approved frame, screenshot
- `JUDGMENT` — subject distinctiveness·typography character·signature·restraint·voice: a user or an independent designer review that looks at the approved brief and screenshots

- Do not couple `HARD` to internal class names or a full DOM snapshot.
- Do not turn `RELATIONAL` into the exact coordinate of every pixel.
- Do not pass `JUDGMENT` without a source merely because it cannot be automated.
- Do not adopt a current production screenshot as a golden image without approval.
- Do not report evidence that shares the same fixture·mock·reference as independent of each other.

## 5. Baseline authority and browser QA

A visual baseline is not an auto-generated output but a policy source approved by the user. To
create or change a baseline, show the user the before/after difference, the target
viewport·theme·motion and the tolerance, get **explicit approval**, and then record the new
baseline. Do not overwrite the previous baseline silently.

Screenshot comparison and runs where a person enters the browser directly belong to the separate
`frontend-visual-qa` skill. Ask the user for authorization before using it; when it is declined,
leave those requirements as pending.

In a `local` or `identity-shaping` change, if a UI-shaping interaction, a `RELATIONAL` requirement,
or a `JUDGMENT` requirement depends on real screen context, run one browser journey before review.
Do not add a new dependency; use only one of the Playwright/Storybook/browser MCP/Figma handoff that
already exists in the target repo. If no tool is installed or the user declined, leave that
requirement as pending or a sourced N/A.

A visual QA result is secondary evidence. It reports PASS·FAIL·N/A per requested requirement, the
environment and the artifact paths, and asks the user when policy is needed. Even if visual QA finds
a product defect, it does not fix production directly.

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

Review before presenting the brief and record the choices you revised and why:

1. Could the palette·type·layout be pasted unchanged onto a completely different product?
2. Is the hero or the first screen the subject's thesis, or a template-style big headline?
3. Do the numbering·divider·eyebrow express the real information structure?
4. Do decorations·motion other than the signature compete for attention?
5. Is the copy the user's language, or internal implementation jargon?
6. Would removing one element make it clearer?
7. Does the direction hold up with real content, long strings, and empty·error states?

## 7. Evidence responsibility

- A `HARD` requirement confirms the expected result and the forbidden outcome together at the
  narrowest **user-observable** DOM·a11y·component tier. Narrowest means the smallest rendered
  outcome, never a new exported map·helper added so the test has something to assert on.
- A `RELATIONAL` requirement maps to a browser artifact or stays pending. A pending or declined
  requirement blocks claiming it as verified unless the user approves a sourced N/A.
- A `JUDGMENT` requirement goes to an independent designer review with the approved criteria and the
  brief. The reviewer does not create new policy. While the review is pending, do not claim the
  requirement as verified.
- A requirement's primary owner: `HARD → test`, `RELATIONAL → browser`, `JUDGMENT → designer`. A
  sourced `N/A` is possible at any tier.

Classify review feedback by visual jurisdiction:

- mismatch between the approved Figma·brief and the actual UI → defect
- a source's visual requirement is missing from the brief, or sources conflict → ask the user
- wrong viewport·font fixture·screenshot conditions → fix the test setup
- judgment impossible due to a tool·font asset·browser startup problem → report the environment problem
- missing visual evidence within the agreed scope → evidence gap
- sourceless reviewer taste → opinion, not reported

## 8. Prohibitions

- forcing a new palette·font·signature plan on every UI change
- applying a reviewer's or an agent's proposal without approval
- reducing design quality to a single unsupported score
- approving the current implementation screenshot as an automatic golden
- coupling the contract to a full DOM snapshot·class names·every pixel coordinate
- adding a new design system·animation dependency·icon library by default in the name of distinctiveness
- adding multiple signature elements and scattered animation
- sacrificing accessibility·performance·responsive fundamentals to an aesthetic risk
- putting screenshots·direct browser runs into ordinary behavior tests

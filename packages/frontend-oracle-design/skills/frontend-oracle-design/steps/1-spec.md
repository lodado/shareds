# Step 1 — Spec

Goal: one `SPEC.md` that says what must be true, from which source, on all seven axes.

1. `fod.mjs init <id>` copies the template to `.ai/oracles/<id>/SPEC.md` (`<id>`: lowercase, digits, `-`).
2. Read the request and the code it touches, bounded to the files that run the behavior. Quote each source:
   `S<n>` for request, ticket or document text (verbatim), `C<n>` for `path:line` and what that code does now.
   An empty repository is fine: the request is `S1`.
3. Fill every section, then run `fod.mjs check <id>` until it prints `ok check`.

## Sections

- **목표** — who does what, and what goes wrong today.
- **출처** — `- S1: ...`, `- C1: path:line — ...`.
- **규칙** — `- R<n>: <when/in which state>, <what> <observable result> (S1)`. One behavior per rule. Each rule
  cites `S*`, `C*` or, when it follows a ★ default, the `Q*` it depends on. Write results a test can observe: a
  count, a text, a state, an order. A rule no Bend model can say (layout, copy, focus ring) ends with
  `(모델 밖: <reason>)`; step 4 gives it a hand-written test.
- **7축** — the table below. Every axis has a value and its boundaries, or `N/A — <why this feature has none>`.
  Leave **모델에서** as `-` now; step 2 fills it.
- **이어받는 규칙** — existing behavior the change must keep. `없음` when there is none.
- **범위 밖** — what this work does not change.
- **질문** — `- Q<n>: <decision> ★ <recommendation and why>`. Only what the sources leave open or contradict.
  Without an answer the ★ recommendation is used, so the rules already follow it and cite the `Q`. Two sources
  that disagree (PRD 18+, legal memo 19+) are one question with both options; never pick one silently.
- **모델** — keys `fod.mjs` reads, below.

## The seven axes

Take boundary values from [bva.md](../references/bva.md): below, at and above each limit, empty and one.

| Axis        | Ask                                    | Typical values                                         |
| ----------- | -------------------------------------- | ------------------------------------------------------ |
| Data        | how much and what shape                | empty, one, many, the limit, a malformed item          |
| Value       | which inputs and their edges           | 0, max, max+1, invalid, a changed key                  |
| Async       | what waits and how it ends             | pending, success, failure, late, never                 |
| Order       | what can repeat or arrive out of order | double click, Enter + click, responses reversed        |
| Entry       | how the user arrives                   | first load, reload, back/forward, deep link, remount   |
| Environment | what outside state changes it          | permission, session expiry, offline, another tab       |
| Platform    | what the device changes                | keyboard Enter/Space, touch tap, viewport, browser API |

Payment and permission work never closes Order or Environment as `N/A` without a source.

Starting conditions are tested only through the model. When an Entry or Data value changes what later events
do (a late response on an empty page, the same response on a full one, a deep link onto a cached key), name it
in **모델에서** as a first event the model offers from `init` (`` `Feed.Load(Empty)` ``, `` `Feed.Load(Full)` ``),
one per class. The generated order cases then run from every start; a start written only in this table is
never tested.

## 모델 keys

| Key       | Meaning                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------- |
| `model`   | path to `MODEL.bend`; `LAWS.bend` and `PROOF.bend` sit beside it (e.g. `src/pay/formal/MODEL.bend`) |
| `prefix`  | the Bend name prefix (`Pay` for `Pay.step`)                                                         |
| `bound`   | trace length the model enumerates; start with 3                                                     |
| `adapter` | path to the adapter step 3 writes                                                                   |
| `out`     | folder for the generated tests                                                                      |
| `product` | comma-separated globs of the files the fix may change                                               |
| `test`    | command that runs the generated tests (and step 4's hand tests)                                     |

Optional: `safe` (a `MODEL.bend` def every reachable state satisfies, proven by `prove-reach`), `state`,
`command` and `relations` (a property suite over every state × command), `runner: vitest` and
`environment: jsdom` for component adapters, `runs` (fast-check samples, default 200).

## Problems `check` reports

| Code                                                | Fix                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `SPEC_MISSING` / `SPEC_EXISTS`                      | run `init` once, then edit the file                                                                                              |
| `SPEC_PLACEHOLDER`                                  | replace the template's `<...>` text or delete the line                                                                           |
| `SPEC_SECTION_MISSING`                              | add the section with its exact heading                                                                                           |
| `SPEC_NO_RULES` / `SPEC_RULE_DUPLICATE`             | write numbered `R*` lines, each once                                                                                             |
| `SPEC_RULE_NO_SOURCE`                               | cite an `S*`/`C*` that exists in 출처, or the `Q*` it follows                                                                    |
| `SPEC_RULE_VAGUE`                                   | replace words like 적절히, 빠르게, properly with an observable result                                                            |
| `SPEC_AXIS_MISSING` / `SPEC_AXIS_UNDECIDED`         | give the axis a value, `N/A — reason`, or a question                                                                             |
| `SPEC_MODEL_KEY_MISSING` / `SPEC_MODEL_KEY_INVALID` | add the key; `bound` and `runs` are positive integers, `runner` is `node-test` or `vitest`, `environment` needs `runner: vitest` |

Next: [step 2](2-proof.md).

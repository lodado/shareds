# Executable delivery protocol

**Last Updated:** 2026-10-03

Read when inspecting or changing the executable delivery protocol. Normal delivery uses the
current-step guide and [ledger rules](delivery/ledger.md), not this authoring manual.

## Source and consumers

[`delivery.protocol.json`](delivery.protocol.json) is executable data in `oracle-delivery/v1`.
[`oracle-protocol.mjs`](../scripts/oracle-protocol.mjs) validates and compiles it to an immutable
contract. [`oracle-run.mjs`](../scripts/oracle-run.mjs) consumes it for legal transitions,
conditional required inputs and target reference roots; `status` and `guide` project those same
rules. It is not merely a documentation schema alongside a separate transition table.

## Grammar

The root has exactly `language`, `transitions` and `targets`; `language` is `oracle-delivery/v1`.
Both maps contain exactly these seven keys:

```text
ORACLE_READY | VALID_RED | IMPLEMENTED_GREEN | REVIEW_VERIFIED |
PARTIAL_VERIFIED | NEEDS_DECISION | FAIL
```

- `transitions[state]` is an ordered, duplicate-free array of those state names; an empty array
  permits no outgoing transition. Its order is the displayed target order, not an automatic choice.
- `targets[state]` has exactly `kind`, `readNodes`, `obligations`.
- `kind` binds to an existing interpreter branch: `resume` for `ORACLE_READY`, `red` for
  `VALID_RED`, `green` for `IMPLEMENTED_GREEN`, `review` for both verified targets, and `escape`
  for `NEEDS_DECISION`/`FAIL`. It cannot introduce executable code.
- `readNodes` is a duplicate-free array of node IDs in [the reference graph](reference-graph.json).
  These are roots; the guide closes dependencies. Reviewer reads remain in the independent context.
- `obligations` is an array of objects with exactly `id`, `when`, `flags`. IDs bind to the existing
  check sites for that kind; unknown, missing or duplicate site IDs are rejected. `flags` is a
  nonempty, duplicate-free array of recognized runner flags. It names required inputs, not values.

Predicates use JSON booleans and a closed expression grammar:

```text
Expr = true | false
     | {"eq": [Fact, Literal]}
     | {"all": [Expr, ...]}
     | {"any": [Expr, ...]}
     | {"not": Expr}
```

Each object has exactly one operator. `all` and `any` require at least one expression;
`eq` has exactly two operands and compares a named fact with a same-domain literal, without
coercion. `not` negates one expression. Nesting beyond the compiler's 32-level limit is rejected.
The only facts and literal domains are:

| Fact                   | Type/domain                          |
| ---------------------- | ------------------------------------ |
| `from`                 | One of the seven ledger states above |
| `risk`                 | `low`, `medium`, `high`              |
| `milestoneCount`       | Nonnegative safe integer             |
| `blindMappingRequired` | Boolean                              |

`blindMappingRequired` is available only at the `review-blind` obligation, after trusted review
evidence has been checked. Using it at an earlier site is a compile error, not permission to
parse evidence early or assume an unknown fact is false. The other facts are available at every site.

Unknown fields, operators, facts, references, flags and mismatched literal types are errors,
not false conditions. Referenced runtime facts are checked before boolean short-circuiting.
There are no expressions containing JavaScript, arbitrary property paths, file reads, commands
or `eval`. The runner supplies facts; the document cannot obtain new authority by naming one.

## Actual obligation example

The `VALID_RED` target includes:

```json
{
  "id": "red-row",
  "when": { "any": [{ "eq": ["from", "VALID_RED"] }, { "eq": ["milestoneCount", 0] }] },
  "flags": ["--row"]
}
```

This requires `--row` for a RED re-entry or a run with no milestones. Otherwise this obligation
adds no flag; other obligations and validators still apply. `requiredFlags` projects active
obligations for a target. `missingObligationFlags` evaluates one named obligation where the
runner already checks that input, preserving rejection order rather than adding an earlier sweep.

## What is not formalized here

Legal edges and required inputs do not prove a transition admissible. Evidence content and
authenticity, lock/worktree checks, TDD ordering, budgets, review independence and ledger writes
remain in their existing validators. The DSL does not replace Bend's product-model proofs.
Source interpretation, policy approval, design judgment and row-to-test semantic adequacy retain
their prose and human/independent-review owners. A guide is advice, never approval or PASS.
This bounded executable contract is not complete formal verification, a filesystem sandbox,
or evidence of token savings.

## Changing the contract

Edit the JSON source, not a second transition table in prose. A new kind, fact, flag or obligation
site requires an explicit compiler/runner change and regression coverage; inventing a document
field is rejected. Register new reference files in the graph. Verify the compiler tests, runner
transition cases and skill-contract tests, including execution/projection agreement and rejection
order. After source edits settle, regenerate reference bundles and check their drift; do not
hand-edit generated bundles. See the package's `test` and `bundles:check` scripts.

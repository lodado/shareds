# Exploring

## Snapshot contract

`observe --snapshot` takes a JSON accessibility tree: a node `{ role, id?, label?, children? }` or an array of root nodes. Accepted aliases: `type`/`class` for `role`; `identifier`/`resourceId`/`testId` for `id`; `text`/`name`/`contentDescription` for `label`; `nodes` for `children`. Convert the device CLI's output to this shape first; do not edit values.

## One step

1. `next` returns either `candidates` on the current screen, or a `route` of known transitions to the nearest screen that still has unexplored actions, or `done`. `unreachable` lists screens with unexplored actions that no recorded transition leads to: navigate there (back, relaunch with `observe --anchor`) and observe; it is not `done`.
2. For a route, run each step (`gate` then `observe`) like any other action.
3. `gate` with `--action`, `--label`, `--role`, `--id` copied from the candidate; route steps carry the same fields under `action`. The gate binds them to one control on the current screen. Pass `--context` with the dialog text when the label is only "OK" or "Continue"; without it the gate returns `context-required`. If `decision` is `blocked`, do not act; read `category`, `reason` and `humanAction`.
4. Act on the device, capture the new tree and a screenshot, then `observe --gate`. One receipt covers one action, and only the newest receipt is accepted.
5. Read the classification: `new-screen`, `new-state` (same structure, different text or loading) or `known`. `no-change` is a stored result (the tree did not move), not a classification.

`next` also logs actions the content rules would block, once each, so the report's human-action list is complete.

## Screen or state

A screen is a structure plus a heading. Text, counts and a spinner coming or going change the state only. Repeated identical rows count as one structure.

- `limitations` containing `low-confidence-fingerprint` means the tree was thin (few nodes, no ids, no heading). Look at the screenshot. `same-structure-other-title` means a new screen shares its structure with a known one: check whether it is the same screen under a changed heading.
- Decide before `observe`: run `identify` on the new tree, then pass `--new-screen` if the fingerprint would merge two screens, or `--screen-id S-00N` if it would split one. The choice is recorded as agent-adjudicated and remembered as an alias, so the same tree lands there next time.
- Set `--state-kind error|empty|dialog` when the screen shows one; set `--screen-type` (login, list, detail, settings...) when known.

## Recovery

- After `back`, `observe` shows where you landed. If you are somewhere unrecorded or the app was restarted, take the screen again with `observe --anchor` (limited to a few per run).
- A `timeout` or `error` result is recorded as an observation but never as a transition and never as evidence.
- Budget counts observed actions, relaunches after the first anchor, and receipts replaced without an observation. Depth, visit and repeat limits come from `init`; when `gate` reports one, stop that path instead of looking for a way around it.

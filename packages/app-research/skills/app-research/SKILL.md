---
name: app-research
description: Explicitly invoked only. Research a mobile or web app's screens, flows, features and policies from gated exploration and public sources, and write a specification in which every claim carries its evidence and every gap is listed.
allowed-tools:
  - Bash
disable-model-invocation: true
---

# App Research

Run this skill only when the user explicitly invokes `$app-research` (or directly requests it). Building an app, copying an app's look or code, and ordinary UI work must not activate it. A flow drawn from Figma, code or requirements belongs to `ux-flow-diagram`; this skill is for observing a running app. For a web target, drive the page with the browser tooling you already have and pass its accessibility tree to `observe`; this skill adds the gate, the evidence log and the claim checks, not a second browser driver.

> Observe first. Model second. Verify before reporting.

## Contract

- The goal is the product's behavior and rules, not a copy of its appearance or code.
- Research only an app the user owns or is allowed to study. Credentials never enter a run: a person prepares the test session (`--test-session human-prepared`) and the agent never types a password or code.
- Never pay, send a real message, delete an account, give legal consent, or transfer data out of the app. Never bypass login, paywalls, or access control. Such a point is recorded as `blocked` with the human action it needs.
- State moves only through `scripts/cli.mjs`. The agent does not edit `run.json`, `screens.json`, `transitions.json`, `observations.jsonl` or `gates.jsonl`.
- A claim is `observed`, `documented`, `code-backed`, `inferred` or `unknown`. Never promote an inference to an observed fact; a rule enforced only on the server is not confirmed from the client alone.
- Coverage is measured against what the run discovered. Never present it as a share of the whole app.

## Workflow

1. Infer target, platform, scope and mode from the request. Ask only for what cannot be inferred (the test session, authorization). `init` creates `research/<app>/<runId>/`.
2. `interactive` mode needs a device CLI. Run its health check first. If it is missing, say so and do not install it without approval; offer `public` mode instead.
3. Record the first screen with `observe --anchor`, then loop: `next` → `gate` → act on the device → `observe`. The device is driven by one agent at a time. See [references/explore.md](references/explore.md).
4. Stop when `next` reports `done`, the budget is spent, or the user's scope is covered. Do not widen the scope to use up the budget.
5. Only then write `features.json` and `policies.json` in the run directory, from observations and public documents. See [references/claims.md](references/claims.md). Public documents may be gathered in parallel by a cheap read-only agent; give it the sources and ask for URL, fetch time, app version and region per fact.
6. `lint` must pass; `render` refuses a failing run. Fix every error at its cause; never weaken the data to pass.
7. Report from `report/unknowns.md` and `report/coverage.md` first, then the flow, features and policies. Say which facts were verified, which are inferred, and what was not researched.

## Commands

```sh
node scripts/cli.mjs init --target <url|package> --platform ios|android|web [--scope all|onboarding|auth|payment|custom] [--scope-note "why custom"] [--mode interactive|public|static] [--max-actions 60] [--max-depth 4] [--locale ko-KR] [--target-version 1.2.3] [--test-session human-prepared]
node scripts/cli.mjs observe --run <dir> --anchor --snapshot tree.json [--screenshot shot.png]
node scripts/cli.mjs identify --run <dir> --snapshot tree.json
node scripts/cli.mjs next --run <dir>
node scripts/cli.mjs gate --run <dir> --action tap --label "Settings" --role button [--id settings_tab] [--context "dialog text"]
node scripts/cli.mjs observe --run <dir> --gate G-0001 --snapshot tree.json --screenshot shot.png [--result ok|error|timeout] [--state-kind content|loading|error|empty|dialog] [--screen-id S-001 | --new-screen]
node scripts/cli.mjs status --run <dir>
node scripts/cli.mjs lint --run <dir>
node scripts/cli.mjs render --run <dir>
```

`identify` previews where a snapshot would land without writing anything; use it to decide `--screen-id` or `--new-screen` before `observe`, because the choice is remembered as an alias. `--scope custom` needs `--scope-note`.

A run folder ignores everything in git, because labels and screens can hold personal data. To share a report, review `report/` for personal data first, then add it with `git add -f`.

`public` and `static` modes record no device observations; their claims rest on documents or code evidence.

## Gate is a floor, not the ceiling

`gate` binds the action to a control on the current screen (no match is `unknown-target`, several matches are `ambiguous-target`), blocks by label and id (Korean and English), and enforces the budget, depth, visit and repeat limits. A confirm-only button such as "OK" is held until you pass the dialog text as `--context`. `open` means a URL, deep link or app launch, and goes through the same rules. The gate cannot see what a button really does. If an action looks risky for a reason the label does not show, do not run it, and report it under unexplored with the reason.

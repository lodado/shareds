# evals — Phase 0 measurement harness

Measures whether a change to this skill makes screens better, not just different: eight briefs run
through a real host with the skill installed, rendered and measured deterministically, then judged
pairwise against a baseline. Nothing here runs in the package test suite except `--dry-run` and the
pure functions; a live run costs host tokens (see below).

## Pipeline

```bash
S=packages/frontend-interface-design/skills/frontend-interface-design   # skill under test
R=/tmp/fid-eval/$(date +%F)                                             # run root

# 1. run-live — one fixture dir per (brief, variant, host, replicate); appends $R/runs.jsonl
node $S/evals/run-live.mjs --host claude --variant baseline  --skill-dir <0.3.0 checkout>/$S --out $R --replicates 3
node $S/evals/run-live.mjs --host claude --variant candidate --skill-dir $S --out $R --replicates 3
#    add --host codex for the second host; --briefs b01-fintech-home-ko,b03-... to subset; --dry-run to only write fixtures

# 2. render — screenshots + metrics.json next to each index.html (run-live prints these lines)
node $S/scripts/render.mjs --in $R/<brief>/<variant>/<host>/<r>/index.html --out $R/<brief>/<variant>/<host>/<r> \
  --lang ko --source $R/<brief>/<variant>/<host>/<r> [--impeccable]

# 3. judge — pairwise, both orderings, yes/no checklist, no scores; one JSON per (brief, host, replicate)
node $S/evals/judge.mjs --brief <brief> --a $R/<brief>/candidate/<host>/<r> --b $R/<brief>/baseline/<host>/<r> \
  --host <host> --out $R/judgments/<brief>-<host>-<r>.json [--with-code]

# 4. grade — gates per unit, pass^k / pass@k per (brief, host, variant), win rates per host
node $S/evals/grade-results.mjs --runs $R/runs.jsonl --metrics $R --judgments $R/judgments \
  --gates $S/evals/gates.json --briefs $S/evals/briefs.json --out $R/summary      # → summary.json + summary.md

# 5. calibrate — judge vs human votes (see below)
node $S/evals/calibrate.mjs --judgments $R/judgments --votes $R/human-votes.json --out $R/calibration.json
```

Copy `$R/summary/summary.{json,md}` (and `calibration.json`) into `results/<date>-<host>-<variant>/`.

## Prerequisites

- **Hosts**: `claude` and/or `codex` on PATH, logged in. run-live calls `claude -p … --output-format stream-json --verbose --permission-mode acceptEdits` and `codex exec --json --sandbox workspace-write --skip-git-repo-check`; judge uses read-only variants (`--extra-args` appends host flags). The skill is exposed by symlinking it into `.claude/skills/` (claude) or `.agents/skills/` + `.codex/skills/` (codex) inside each fixture directory.
- **Playwright**: `render.mjs` has no dependency of its own. `npm i playwright-core` in any directory and pass that directory with `--playwright <dir>` or `FID_PLAYWRIGHT_DIR=<dir>`; the current working directory and the script's directory are also tried. For the browser either `npx playwright install chromium` in that directory or point at a binary with `--executable-path <chrome>` / `FID_CHROMIUM_EXECUTABLE=<chrome>`. Chromium is launched headless with `--no-sandbox`.
- **impeccable** (optional): `--impeccable` runs `npx --yes impeccable detect --json --no-config` (static HTML engine for files, browser engine for URLs). Its counts are recorded, not gated — the source scan undercounts.

## Cost

One live run = 8 briefs × k replicates × hosts × variants host calls (k = 3, two hosts, two variants → 96 generation runs), plus 2 judge calls per (brief, host, replicate) pair (48). Start with `--replicates 1 --briefs <one id>` to check the plumbing, then scale up.

## Shapes

`metrics.json` (`scripts/render.mjs`):

```text
{ "schemaVersion": 1, "input": "…/index.html", "lang": "ko",
  "renderer": { "playwright": "playwright-core from …", "playwrightVersion": "1.56.1", "chromium": "141.…", "executablePath": null },
  "errors": [],                              // "<viewport>-<theme>: message" per failed cell
  "viewports": { "375-light": { "screenshot": "…/375-light.png", "textNodes": 40, "contrastFailures": 0, "samples": { … }, … }, … },
  "aggregate": { "cells": 4, "renderedCells": 4, "contrastFailures": 0, "horizontalOverflow": 0, "emojiGlyphs": 0, "tinyText": 0,
                 "smallTapTargets": 0, "longLines": 0, "fontFamilies": ["Pretendard"], "fontFamilyCount": 1,
                 "hangulTextNodes": 30, "hangulKeepAllCoverage": 1, … },    // worst cell wins; coverage is null without Hangul
  "source": { "files": 3, "literalValues": 2, "tokenReferences": 80, "literalRatio": 0.0244, "skipped": ["…/tokens.css"] } | null,
  "impeccable": { "available": true, "findings": 3, "byRule": { … } } | { "available": false, "reason": "…" } | null }
```

`gates.json`: `{ "gates": { "<metric>": <max number> | { "max"?, "min"?, "whenLang"? } } }`. A brief's own `gates` object overrides by name — a bare number keeps the default's kind (max or min) and its `whenLang`; an object merges field by field. `whenLang` gates apply only to briefs of that language. Every gate reads `aggregate.<metric>` first and `source.<metric>` second; a value the render did not produce (for example `literalRatio` without `--source`) fails closed as `MISSING_METRIC`.

`judge.mjs` output: `{ briefId, a: { dir, variant, host, replicateId, caseId }, b: { … }, host, winner: "A" | "B" | "tie", checkPass: { A, B }, positionBias, orderings: [AB, BA], errors }`. `a`/`b` identity comes from each run directory's `meta.json`; `--a-variant/--b-variant` override it for directories that run-live did not create.

`grade-results.mjs` unit = (caseId, host, variant, replicateId). Per (caseId, host, variant): `passK` (all replicates pass), `passAtK` (any), `replicateCount`, per-gate failure counts; `DUPLICATE_CASE` when repeats share or lack replicateIds. Win rates per host: `winRate = wins / (wins + losses)` (null without a decisive pair), `winRateWithTies = (wins + ties / 2) / judged`. Hosts and variants are never pooled. `authoritative` is true only when every brief × host × variant in scope has results (and, when `--judgments` is given, every brief × host has a judgment) and no structural error occurred; the exit code is 1 otherwise, never because of gate failures.

## The skill's Look loop reuses the same renderer

`references/look.md` step 1 is this renderer on a static harness page, with the same gates:

```bash
node <skill>/scripts/render.mjs --in design-loop/harness.html --out design-loop/r1 --lang ko --source src/
```

`design-loop/r1/375-light.png` … and `design-loop/r1/metrics.json` come out; gate failures are fixed before any critique so the deterministic numbers anchor the LLM's judgement instead of the other way round.

## Multi-turn interaction cases (manual)

`interaction-cases.json` is a small, human-readable forward-test corpus (currently including brand-source conflicts, absent token systems, unavailable editable targets, prior approval, and scoped feedback); it is **not** loaded by `evals/run-live.mjs`. For each case, create an isolated workspace and give the evaluated agent only `prompt` plus `setup` (never `reply` or `expected`). Answer the agent's material questions with `reply`, then collect the actual questions, brief/readiness decisions, moodboard directions, section choices, and rendered screens. Judge those observations against `expected` separately. This is the only supported way to evaluate the multi-turn behavior today; schema validation does not mean these cases passed.

The existing `run-live.mjs` → render → judge → grade pipeline remains a fixed-brief visual evaluation. It does not automatically perform the multi-turn interaction protocol above.

## Section implementation cases (manual)

`section-spec-*` covers a document-only instruction artifact, implementation through delivery, and a scoped Fidelity fix.
Follow the multi-turn protocol above; prepare each stated fixture before running implementation cases.
Judge whether section names become concrete layout/state/mobile/implementation/check decisions, not whether the answer repeats taxonomy labels.
The document-only case can validate instruction specificity and scope without a browser; it cannot prove visual quality.
Package tests check linked resources and corpus integrity, not that these behavioral cases passed.

`dictionary-source-to-implementation` additionally checks original-source reading versus packaged-summary fallback,
specific layout/motion decisions, and separation of source recommendations from agent-authored values.

## Human calibration

For the `visual-adoption-*` manual cases, pin the pre-change skill and candidate and give both the same
content, assets, tools and time budget. Hide version names, implementation narratives and test counts;
randomize screenshot order. A user/design evaluator records brief fit, composition, preference reasons,
whether early rejection was appropriate, and any later large rework. Keep functional/accessibility results
separate and retain existing regression gates. Include image-free lists, image-led galleries, long Korean
titles and expressive heroes; use the existing content-fit/clone cases as controls, not only the blog failure.
The original blog case requires the four named source artifacts from its setup. If absent, record it as
unreviewed; do not fabricate a reproduction or treat the user's reported failure as a fresh visual observation.
Fixture/contract tests do not execute these cases. Do not claim aesthetic improvement from their passing,
one evaluator's preference, or an invented aesthetic score/target preference rate.

1. Pick 20 judged pairs across briefs and hosts (both winners and ties). Show each pair's screenshots blind — hide variant names and swap sides at random.
2. Record one vote per pair in `human-votes.json`: `[{ "briefId", "a": "<dir or variant>", "b": "<dir or variant>", "winner": "A" | "B" | "tie" }]`.
3. `calibrate.mjs` computes agreement over the human's decisive votes only; a judge tie against a decisive human vote is a disagreement.
4. Target: agreement ≥ 75% (MLLM-as-judge 77% and human–human 68.7% are the reference points). Below the target the checklist questions are the suspect: rewrite the ambiguous ones, re-judge, re-measure. A skill change is adopted only on a calibrated judge.

## Content-fit regression batch

`interaction-cases.json` also covers image-free article discovery, missing essential imagery, intentional
whitespace, demo-only consent, structural rejection, and an exhausted repair budget. Materialize each setup
with actual copy and permitted assets in an isolated workspace; incomplete setup is not a passed run.
Run baseline and candidate on the same inputs and collect tool actions, reference evidence, static
desktop/mobile output, and separate technical/design/user-acceptance records. A text-only forward test
can check decision boundaries but cannot prove visual quality. Use pairwise screenshots with swapped
ordering for visual review; record human feedback separately from model judgment. Passing document or
scenario-schema tests does not mean this batch has run or that one-shot design quality is guaranteed.

## Multi-site clone study cases

The manual corpus also covers proposal-only multi-site research, an approved clone study with final
application, an unavailable clone tool with no installation permission, and accurate clones that fail
actual-content fit. Supply exact permitted URLs, browser access, prepared isolated roots and actual
content for live execution. Record proposal, execution authorization, source observations, clone
locations, content variants and selected final patterns separately. A next-action simulation can check
boundaries, but is not proof that websites were cloned, rendered or visually compared.

## Experience regression cases (0.6.0)

`interaction-cases.json`의 `experience-*` 15건은 원본 관측·변경 권한·모션·여정·리텐션의 행동 평가다. 각 case의 `expected`, `failure`, `evidence`를 사용한다. 격리 환경에 원본/기존 화면 등 필요한 fixture를 준비한 뒤 실행하며, `artifacts: []`는 자료가 이미 준비됐다는 뜻이 아니다. 접근 불가 사례 외에는 실제 관측 가능한 fixture가 있어야 실행 평가가 된다.

문서 계약 테스트는 연결과 시나리오 필드만 확인한다. 모델 판단 dry-run과 브라우저에서 구현·동작을 관측한 end-to-end 결과를 별도로 기록한다. 15건이 등록됐다는 사실을 15건 실동작 통과로 보고하지 않는다.

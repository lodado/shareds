---
'@lodado/eslint-config': minor
---

Add an opt-in `ai` preset over `eslint-plugin-ai-guard` for defects coding agents
produce that still pass the type checker: `.map(async ...)` returning promises instead
of values (error), plus warnings for a catch that logs and rethrows, `JSON.parse` on a
request body with no validation, `async` on a function that never awaits, independent
awaits serialized in a loop, `catch (error: any)`, and Express/Fastify routes with no
authentication or ownership check.

Ten of the plugin's eighteen rules ship off. Each restates a judgement another preset
already makes with more information - `ts/no-floating-promises`,
`ts/no-unnecessary-condition`, several SonarJS security rules, `no-eval`,
`unicorn/no-unnecessary-await` and base `no-console` - so one defect
reports once. A repo that skips `quality` or `strict-types` should turn the matching
rules back on; the skill documents which.

`eslint-plugin-ai-guard` is an optional peer, installed only by repos that extend the
preset.

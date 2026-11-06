# Multi-runner benchmark preparation, 2026-11-06

Status: **PREFLIGHT_BLOCKED**, conditional coordinator GO received at 2026-11-06T02:34:22Z. Execution is authorized only after public scheduler argv compatibility passes. Current adapter rejects Vitest `--no-cache`; no new stress workload has started and there are no new performance claims.

## Historical artifacts

- `baseline-2026-11-06.json`: failed first attempt, configuration loading failed before a valid baseline. Never combine with successful results.
- `baseline-2026-11-06-v2.json`: corrected, successful historical Vitest 4.1.9 direct-run baseline. 39 experiments, three repeats, four jobs each. Its queue caps are harness limits, not scheduler results.
- Those files retain their historical schema and measurements unchanged. New comparisons use schema 3 and new output names.

## Read-only inventory

```sh
rtk proxy python3 tools/agent-test/diagnose.py --root /Users/chungheon/orca --output /Users/chungheon/.jcode/agent-test-orca-diagnostic-v2.json
```

Observed 33 Git checkouts, 218 JS packages with runner evidence, 170 Vitest, 46 Playwright, 6 Jest, 45 node:test package records, and 12 pytest project records. Runner categories overlap. Installed metadata can be hoisted, so installed availability is distinct from a package's own declared dependencies and actual matching script names. Bun test, Mocha, AVA, TAP, and Cypress detection is supported but no matching records were observed. Python installations outside each project's `.venv` are not inferred. Scripts are identified by name without exporting their shell bodies or executing them. No `.env` or unrelated process command arguments are read.

## Exact comparison CLI

Plan only, safe before the start signal:

```sh
rtk proxy python3 tools/agent-test/benchmark.py --project /Users/chungheon/Desktop/programming/deep-agent-uiux-nextjs --scheduler /Users/chungheon/orca/my-Vibe-Coding-Helper/tools/agent-test/agent-test --runner vitest --jobs 4 8 --repeats 3 --budget 4 --output tools/agent-test/results/comparison-2026-11-06-v3.json
```

After coordinator authorization, append `--execute` to that exact command. Optional budget-six comparison uses `--budget 6` and a distinct output filename. Scheduler fixed comparison stays budget4/max-runs2/workers2 regardless of the optional weighted budget.

Each job-count comparison submits identical test files for default workers, worker-only cap2, global fixed4/2/2, and weighted mixed worker requests1/2. Case order rotates each repeat. The default eight document unit-test files are reused only for Vitest. `--runner playwright`, `jest`, or `node` requires explicit repeatable `--test relative/path` arguments and local installed runners. No package manager or download fallback is used. A caller must choose side-effect-free tests whose config does not write into the target project. The existing Vitest workload disables cache and writes attachments outside the project. Playwright config hooks/web servers are not automatically safe or authorized just because its runner exists.

Every scheduler experiment gets its own private short `AGENT_TEST_HOME`, no production scheduler configuration is altered. Submission explicitly opts into duplicate and concurrent-worktree execution for this isolated identical workload. Overall budget is 600 seconds, client deadline55 seconds, scheduler run timeout40 seconds, and owned sampled RSS limit8GiB. Severe memory/thermal pressure also aborts. Only owned subprocess groups are signaled. The unrelated next-server PID57791 is never touched.

## Accounting and privacy

- Direct CPU uses wait4 user+system seconds, including waited descendants but not necessarily detached children.
- Scheduler CPU uses client wait4 only, explicitly **not comparable to direct workload CPU**. No fabricated workload CPU is reported.
- RSS samples include scheduler-owned job PIDs through the private status socket, in addition to clients. Sampling can miss brief processes and RSS can double-count shared mappings.
- ps CPU percentage remains an OS lifetime average, not interval utilization.
- Per-job harness wait/run times represent submission-to-client-launch and client end-to-end duration. Scheduler status wait/run seconds are separate fields.
- Raw test output is discarded instead of logged, as tests may print credentials. Only explicit harness-generated command arguments are recorded, never environments or unrelated process arguments. Machine snapshots contain topology, swap, vm and pressure summaries, not repeated full process dumps.
- Historical confound remains: previously reported next-server load around122% CPU/6GiB RSS and substantial swap. Do not interpret an unobserved current value as measured.

## Lightweight validation

```sh
rtk proxy python3 -m unittest discover -s tools/agent-test -p test_benchmark.py -v
```

Eight of nine lightweight tests currently pass: multi-runner detection/privacy, hoisted installed versions/malformed metadata, runner caps, default plan-only behavior, owned-child accounting with discarded output, separate redacted completed scheduler timings, actual Node ESM prelude parsing with spaces/quotes, and safe serialization of a prelaunch pressure abort. The public adapter regression intentionally remains blocking until Vitest's safe cache/config-loader/attachment flags are explicitly supported by the core worker. Exact read-only plan invocation also rejects the incompatible payload before starting any direct workload. These are harness checks, not runner integration or stress results.

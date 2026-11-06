# Initial real baseline, 2026-11-06

## Reproduction

From the repository root:

```sh
rtk proxy python3 tools/agent-test/benchmark.py --project /Users/chungheon/Desktop/programming/deep-agent-uiux-nextjs --output tools/agent-test/results/baseline-2026-11-06-v2.json --repeats 3
```

The successful run began 2026-11-06 01:54:22 UTC and finished 01:59:26 UTC (304.5 seconds). `baseline-2026-11-06-v2.json` records every exact child command, timestamped machine snapshots, process-tree samples, wait4 accounting and individual job wait/run durations. Full per-job logs remain at the scratch paths recorded in the JSON. The adjacent Markdown contains medians.

The initial attempt (`baseline-2026-11-06.json`, 01:53:51 UTC) failed configuration loading because Vite's runner config loader does not provide `__dirname`. The harness now supplies the project root with a Node import prelude. Runner loading avoids Vite writing a temporary bundled config inside the target project. Cache is disabled and attachments/logs go to scratch. The target's actual jsdom environment, setup file, aliases, and test imports remain in use.

## Fixed workload and findings

Eight inspected unit files: piiMask, fieldSchemaAdapter.attachMeta, fieldSchemaAdapter.bbox, fieldSchemaAdapter.confidence, fieldSchemaAdapter.maskstate, maskVisibility, review-utils, schemaFieldValueType. Each job passes 8 files and 32 tests. Every experiment runs the same four copies, not a different amount of work at each concurrency.

All 39 experiments and 156 jobs passed, with no timeout or severe-pressure abort. This is 1,248 test-file executions and 4,992 individual test executions. The total includes three repeats of all 12 concurrency 1/2/4 by workers 1/2/4/6 combinations, plus three default-worker experiments with four simultaneously launched jobs.

| Comparison                         | Median wall | Aggregate CPU | Sampled maximum aggregate RSS |
| ---------------------------------- | ----------: | ------------: | ----------------------------: |
| Default workers, four jobs at once |     6.638 s |      37.451 s |                    6333.9 MiB |
| Workers-only2, four jobs at once   |     5.266 s |      32.205 s |                    2610.0 MiB |
| Direct bounded queue2, workers2    |     6.025 s |      27.237 s |                    1351.8 MiB |

The direct queue2 result is a harness concurrency cap, **not an agent-test scheduler result**. It suggests a favorable memory tradeoff for this small workload but does not establish scheduler overhead or weighted-policy behavior.

## Limits and confounds

- Raw measurements are local observations, not universal performance claims. Cases use fixed order without warm-up exclusion or randomization. Background activity and warm caches vary across repeats.
- User-reported initial confound: unrelated next-server PID 57791 exceeded 100% CPU and approximately 6 GiB RSS, with swap around 7.7 GiB. The successful run's opening snapshot measured swap used 9584 MiB. Timestamped argument-free process snapshots preserve the actual surrounding load.
- Memory pressure was measurable through `kern.memorystatus_vm_pressure_level`. Thermal reporting returned no recorded warning or CPU power status, which is not a temperature measurement.
- `ps` samples occur approximately every 0.5 seconds. Aggregate RSS can double-count shared mappings and its sampled maximum is not true peak memory. `ps` CPU percentages are OS-reported lifetime averages, not per-interval utilization.
- Per-job `wait4` CPU includes descendants that were waited by their parents. Detached or uncollected descendants are not guaranteed. Normal Vitest workers completed and the job logs show all expected tests passed.
- The scheduler comparison needs daemon/guardian accounting: client wait4 alone cannot measure daemon-owned test workers. Do not interpret client-only CPU/RSS as scheduler workload metrics.

After this baseline, the cleanup path was corrected to reap a TERM-exited child before considering KILL, avoiding macOS EPERM for expired groups. A synthetic four-job accounting run, process-tree sample and short overall-deadline cleanup passed. No existing user process was signaled, no dependency was installed, and no commit was made.

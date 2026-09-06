# Verification report

Date: 2026-09-07, Asia/Seoul. Implementation includes host instructions plus deterministic Python tools. It is not model fine-tuning.

## Observed acceptance checks

| Requirement                                    | Check and actual result                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| md/txt/html ingestion, stable versioned blocks | Analyzer tests cover recursive loading, stable IDs, changed versions, code fences, HTML structure, inline code, inert source instructions. Passed.                                                                                   |
| Document-level generalization separation       | Duplicate grouping, transitive grouping, small-corpus warning, quarantine exclusion and exact assignment tests. Passed.                                                                                                              |
| Rolling windows and history                    | Real CLI imports/snapshots, timezone boundaries, future collection, expired article republished under a new URL, historical split inheritance and conflicts. Passed.                                                                 |
| No native-format corruption                    | Snapshot and direct parser blocks compared for Markdown-looking plain text and HTML. Passed after removing Markdown re-encoding.                                                                                                     |
| Stylometry                                     | Length quantiles, denominators, short/single-sentence frequencies, formatting signals and empty inputs. Passed. Korean NLP remains heuristic.                                                                                        |
| Evidence-first profiles                        | Schema fields, missing/held-out references, duplicate-component confidence inflation and snapshot document ID resolution. Passed.                                                                                                    |
| Activation and correction isolation            | Reject unreviewed/empty/unsupported profiles, permit explicitly weak exploratory profile, preserve immutable versions and correction diff without corpus ingestion. Passed.                                                          |
| Originality guard                              | English/Korean overlaps, normalization, n-grams, short common phrases, code/quote notices, per-pair and aggregate work budget, incomplete status. Passed.                                                                            |
| Semantic limits                                | Missing literal is a warning, present literal does not claim meaning preservation, interpretive review categories remain not_run in deterministic output. Passed.                                                                    |
| Portable skill                                 | Entire skill copied outside repository, all 63 tests passed with Python 3.14.3. Individual worker checks also used Python 3.11.                                                                                                      |
| Repository integration                         | `pnpm test` passed all 9 package tasks and 3 hook tests. Final run exit 0.                                                                                                                                                           |
| End-to-end local example                       | Three synthetic posts imported, 30-day snapshot created, one weak supported ending rule reviewed, evidence validated, exploratory profile activated, independently supplied brief drafted and checked. Result in evals/demo-result/. |
| Writing variants                               | Saved A–E outputs, exact input records, ledger/plans and qualitative review. B copied a short catchphrase. C/D/E avoided it. This is a smoke observation, not an independent blinded comparison.                                     |

Commands:

```bash
pnpm --filter @lodado/blog-voice-cloner-plugin test
pnpm test
python3 evals/run_demo.py --output /path/to/new-demo-directory
```

The demo command is run from the installed skill directory. It reuses a saved model draft, not a fresh model invocation.

## Review-driven fixes

Independent read-only review reproduced five concrete issues, then the owners added regression tests and fixes:

1. Duplicate documents inflated rule confidence. Confidence now counts duplicate components.
2. Snapshot validation re-read reference Markdown instead of normalized documents. Snapshot documents.json is now loaded with shape checks.
3. Converting plain text and HTML to Markdown changed block roles. Native input bytes/extensions now remain intact through parsing, and stable author IDs are mapped before splitting.
4. Inline HTML code broke a prose sentence into separate blocks. Inline identifiers now remain in prose.
5. Per-pair overlap limits did not bound total work. Aggregate comparison/character-product budgets now stop with an explicit incomplete-review finding.

An early full-repository run overlapped the newly added failing regression tests and failed. It is not counted as a pass. The final full run after fixes passed.

## What is not established

No live influencer URL/corpus was supplied. Actual web collection completeness, real-author generalization, independent semantic review, human style preference and measured human editing effort remain untested. The three-document sample is explicitly insufficient for independent validation/held-out evaluation. The A–E smoke uses two agent contexts, not one isolated context per variant. No copyright/plagiarism safety or numerical style-similarity claim is made.

Host instructions, not a Python sandbox, enforce content/style context isolation and qualitative writing decisions. A future host must obey the skill and load references progressively. Source corpora stay local by default, but host-model processing is not inherently offline. Large historical duplicate clustering has quadratic cost. Trust the local data root and use explicit retention/security policies.

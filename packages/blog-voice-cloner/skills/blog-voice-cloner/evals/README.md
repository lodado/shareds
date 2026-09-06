# Evaluation artifacts

## What actually ran

- `sample-corpus/`: three newly written synthetic Korean posts in Markdown, plain text and HTML. No influencer corpus was supplied.
- `run_demo.py`: real CLI import → 30-day snapshot → profile-only metrics → one evidence-backed weak ending rule → exploratory activation → deterministic draft overlap check. Run with `python3 evals/run_demo.py --output /path/to/new-output` from the skill directory. Output must not exist.
- `demo-result/`: captured local demo result, selected documents/splits, descriptive metrics, weak profile and overlap report. All data is synthetic. The coordinator wrote demo-draft.md using the extracted weak ending rule and independent demo-brief.md. The runner reuses that saved draft, not a fresh model call. Ledger and same-context review are retained.
- `smoke/A.md` through `E.md`: actual saved model outputs using the same cache brief. A/B were generated in one baseline agent, C/D/E in another agent. C/D/E used a manually supplied synthetic profile, not an inferred influencer profile. Prompts, ledger, plans, per-category review and injection microcase are retained.

## Observed result, not an efficacy claim

B copied the short sample catchphrase `문제는 여기서부터다.` and repeated rhetorical questions. It did not copy the fictional twelve-server biography. C/D/E avoided that catchphrase and kept the supplied same-key, expiry and uncertainty constraints in the saved examples. These observations are coordinator/same-agent review, not blinded human judgment. A short distinctive catchphrase may be below the default long-substring guard threshold, which is why qualitative over-imitation review remains required.

All C/D/E examples omit questions and analogies, so E demonstrates no additional reduction versus D. There is no evidence that adding correction rules always improves quality. Some drafts are shorter than the soft requested length to avoid inventing claims.

Human style preference: **not_run**. Actual human editing effort: **not_run**. Independent fresh-context A–E benchmark: **not_run**. Live website coverage: **not_run**. Real-author held-out generalization: **not_run**.

For an actual blinded study, follow `references/evaluation.md`, use independent generation contexts and a separate identity key, counterbalance pair order, collect human decisions and edits, and retain disagreements. Do not turn these smoke artifacts into a percentage style-similarity claim.

## Follow-up traceability and outcome check

`requirement-map.md` enumerates all 20 requirements plus approved storage behavior, with specific tests, observed results and unverified parts. `verify_requirements.py` executes each referenced test and records `requirement-observations.json`, including bounded saved-variant measurements. A separate brief-only AI reviewer checked the actual demo: 7 output units, 10 atomic claims, no unsupported claims or actionable semantic findings. See `independent-meaning-review.json`. This is not a human preference result.

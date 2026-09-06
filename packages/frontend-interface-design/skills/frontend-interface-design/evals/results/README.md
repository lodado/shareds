# results

Graded harness runs, one directory per run: `<date>-<host>-<variant>/` (for example
`2026-09-06-claude-candidate/`), holding the `summary.json` and `summary.md` that
`grade-results.mjs --out` wrote, plus `calibration.json` when human votes were collected.

- `<date>` is the day the generation runs finished (`YYYY-MM-DD`).
- `<host>` is the generator host (`claude`, `codex`); a summary that grades both hosts is stored
  once under the first host with a `hosts:` line in its `summary.md`, never merged into one number.
- `<variant>` names the candidate arm that was judged against `baseline`.

Screenshots, transcripts and `index.html` files stay in the run root outside the repo; only the
summaries are committed. A directory without `summary.json` is not a result.

# frontend-interface-design — harness summary

- generated: 2026-09-12T02:12:25.590Z
- authority: AUTHORITATIVE_FULL_CORPUS
- briefs 3 · hosts codex · variants baseline · units 6 · judgments 0

## codex

### Gates — pass^k / pass@k per brief

| brief                    | baseline                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| b03-marketing-landing-ko | pass^k 0/2 · pass@k no · RUN_ERRORS×2, emojiGlyphs×1                        |
| b06-content-reading-en   | pass^k 0/2 · pass@k no · RUN_ERRORS×2                                       |
| b07-data-table-ko        | pass^k 0/2 · pass@k no · RUN_ERRORS×2, MISSING_METRICS×1, smallTapTargets×1 |

| variant  | briefs pass^k | briefs pass@k | k   | gate failures                                                     |
| -------- | ------------- | ------------- | --- | ----------------------------------------------------------------- |
| baseline | 0/3 (0%)      | 0/3 (0%)      | 2   | RUN_ERRORS×6, emojiGlyphs×1, MISSING_METRICS×1, smallTapTargets×1 |

### Metric distribution (worst cell per unit)

| metric                | baseline min / mean / max |
| --------------------- | ------------------------- |
| contrastFailures      | 0 / 0 / 0                 |
| emojiGlyphs           | 0 / 0.2 / 1               |
| hangulKeepAllCoverage | 1 / 1 / 1                 |
| hangulTextNodes       | 50 / 60.3333 / 75         |
| horizontalOverflow    | 0 / 0 / 0                 |
| literalRatio          | 0 / 0.0039 / 0.0085       |
| longLines             | 0 / 0 / 0                 |
| smallTapTargets       | 0 / 2.6 / 13              |
| tinyText              | 0 / 0 / 0                 |

### Judge — candidate vs baseline

No judgments for this host.

## Errors

None.

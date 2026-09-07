# From profile to a run-specific voice brief

The profile records observations. `voice-brief.json` tells the writer what to do in this run. Build it from the selected profile and authorized overrides, not a new corpus analysis. Keep only useful decisions: more rules do not necessarily mean a closer voice.

## Shape

```json
{
  "profile_version": "immutable-version-id",
  "genre": "requested-genre",
  "voice_summary": "A short evidence-grounded description, not praise.",
  "decisions": [
    {
      "rule_id": "existing-profile-rule-id",
      "role": "opening",
      "trigger": "The content situation that activates the rule.",
      "action": "The information-order, register or rhythm choice to make.",
      "evidence": ["snapshot/document:block"],
      "semantic_boundary": "The claim, attribution or experience this choice cannot add.",
      "priority": "core",
      "status": "applicable"
    }
  ],
  "not_applicable": [],
  "derived_contrasts": [],
  "limitations": []
}
```

This schema illustration contains no real author observations. Replace illustrative values with validated pointers; omit unsupported decisions. Prefer a small selection (often 3–7, not a quota) spanning the title/opening, information sequence, local tone and ending. Mark unsupported roles `not_applicable` with a reason. `core` means useful to this run, not upgraded confidence. Where two rules conflict, apply the narrower supported scope and document the exception.

Choose examples from PROFILE only, by genre and rhetorical role first, then useful length, tone and topic. Avoid redundant excerpts and use a bounded context budget. Topic matches are not proof of style matches. With a small corpus, manual selection is enough; no embedding database is required.

## Optional development contrasts

A `derived_contrast` pairs an observed failed model passage with a source-supported explanation and a corrected example. Record the generating run/model, original PROFILE evidence, the exact stylistic difference, preserved claim IDs, and whether a human approved the correction. These are **not author evidence** and never increase source support counts or enter the corpus/metrics.

Build contrasts in a separate development run, not from the final comparison cases. If neutralizing a source passage for calibration, label the neutral text as derived and keep that calibration content separate from new-article CONTENT_SOURCE. Do not mine VALIDATION or HELD-OUT wording for examples. A reusable contrast needs a specific observed gap; skip this step if no useful failure exists. Store only a few nonredundant failures, not a growing transcript.

The contrast teaches the difference, not an entire replacement paragraph to copy. Human corrections to the user's preferred voice belong to USER_OVERRIDES unless independently supported as reference-author behavior. Successful use on a calibration passage is not evidence of held-out generalization.

# Core-loop and rules contract

Write: "The player wants **_, chooses between _** and **_, sees _**, and next tries \_\_\_."
Start with the experience, not login, shop, ranking or badges. Separate a useful toy-like action from an overall game objective; a pleasant motion alone does not validate sustained play.

For each loop record observe → predict → choose → input → rule processing → feedback → updated situation. Inputs should have meaningful consequences under different contexts. Record player control, revealed/hidden information and randomness. Do not promise fairness solely because randomness is seeded.

Define only applicable rules:

- valid input and commitment/cancellation moment;
- motion, placement, overlap/collision, merging or obstacle rules;
- scoring/progression, win/endless objective, risk/reward;
- event priority, pair consumption and simultaneous interactions;
- failure warning and authoritative failure commitment;
- restart and optional continue; data reset vs persisted;
- novice/expert decisions and dominant-strategy risk.

Every rule gets `R-` ID, plain-language invariant, example, counterexample, affected screen/state and test idea. Do not use a missing difficulty decision as permission to invent a hidden advantage for ads.

Merge-specific pitfalls when applicable: one entity cannot merge twice in a tick; eligible pair selection must be deterministic for a declared event ordering; define the maximum tier behavior; remove/mark consumed IDs before awarding score; decide whether newborn objects can merge in the same tick; define grace-period and overflow measurement. Do not transplant these into an unrelated runner.

Stack-specific: establish projection/overlap axis, tolerance and cutoff; visual cut equals judged overlap. Runner-specific: describe lane occupancy/timing windows and telegraphing. These are examples, not mandatory features.

Paper walkthrough: work one ordinary situation, one failure and one edge case with actual values labeled initial tuning. If the design cannot explain the result, reopen rules before polishing UI.

Smallest MVP: one complete playable loop and replay. Exclude generalized engines, large economies and content catalogs until a tested need exists. State what observation would cause a change or abandonment of this particular hypothesis—not of the whole project by default.

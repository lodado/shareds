# Fork map

Source: frontend-interface-design 1.8.1 at 85d39f7258c60228201ab916a8d69f315eb51658.
This is a source-contract fork, not a byte-for-byte archive of the entire original package.
The existing package stays separate; no runtime import/call into it is required.

| Original                                 | Independent game fork                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| plugin manifests                         | New name/version, game description and prompts; no source entry overwritten      |
| frontend-interface-design alias          | game-interface-design → local reference-driven-game-design                       |
| reference-driven-figma-design main skill | Game-first stages with PLAN_ONLY and optional FIGMA                              |
| request/HCI/foundations/composition      | Local game-specific variants plus local Figma-only contracts                     |
| component-source-gate.md                 | Exact copy under references/figma; its log field names are mapped locally        |
| critique-refinement.md                   | Exact copy under references/figma; product emphasis translates to game field/HUD |
| prototype-workflow.md                    | Exact copy under references/figma; no claim of playable physics/feel             |
| mandatory private taxonomy               | Removed as a runtime dependency; optional local sources stay private             |
| frontend delivery schema                 | New game request/delivery schemas; no changes to upstream schema                 |
| old evaluations                          | Replaced by local structural regression tests and 24 unexecuted agent rubrics    |

New modules: loop/learning; run state and interruptions; first meaningful play; world/HUD/readability;
feedback; return/business hypotheses; Three.js handoff; experiment and evidence dimensions.

Short entrypoint loads references progressively. The package does not implement game code,
run a browser, install Figma, enforce hooks, publish to GitHub, or certify fun.

provenance.json records exact retained-source hashes. Tests confirm local structure and consistency;
real host execution and player outcomes remain unverified.

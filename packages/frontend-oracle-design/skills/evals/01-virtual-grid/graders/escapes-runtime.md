---
type: llm
focus: {source: file, path: ".ai/oracles/store-list-virtualization/oracle.md"}
weight: 1
---
This request was implemented once before, and three defects escaped because the card did not name them. Check whether this Draft Oracle names each one, in a contract row, an interaction-sweep cell, a deviation or landmine entry, or an Open question. Naming means the specific mechanism is described, not only a generic word like "StrictMode" or "scroll".

1. StrictMode double-invoke of the effect that owns the append timer: the effect runs, cleans up, and runs again; the cleanup must restore the pending flag (or the append state), not only clear the timer. Look for text that connects StrictMode (or double-mount / double-invoke) to the append or batch-load timer and its pending state.
2. The inherited filterKey remount crossed with the virtualizer's mount-time scroll reset: when filterKey changes the list remounts, and the window virtualizer's initial scroll position (scrollTo(0) / initialOffset / scrollMargin) fires on that mount, so every filter change scrolls to the top. Look for a cell, landmine, or question that pairs the remount with the initial scroll position or offset.
3. The initial default column count versus the first ResizeObserver measurement: the first render uses a default (for example 4 columns) before ResizeObserver reports the real count, and the layout jumps. Look for text that names what is rendered before the first measurement, or the default-to-measured transition.

PASS only if all three are named. FAIL otherwise, and list which of the three are missing.

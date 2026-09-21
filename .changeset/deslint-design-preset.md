---
'@lodado/eslint-config': minor
---

Add an opt-in `design` preset over `@deslint/eslint-plugin` for the axis the other
presets leave alone: markup that escapes the design system. Arbitrary colors, spacing,
typography, radii, z-index and layout numbers fail, as do a secret env var or a
server-only module reaching a `'use client'` file and placeholder or mock code shipped
as product code. Dark-mode and breakpoint coverage, spacing rhythm, palette size,
inline styles and utility-class count warn, because the theme cannot decide those alone.

Its accessibility, security and Tailwind-correctness rules ship off - `a11y`, `quality`,
`tailwind` and `local-rules` already decide the same questions - and the preset names
the owner beside each one.

`@deslint/eslint-plugin` is an optional peer and ESM-only, so the preset file is
`design.mjs`; the public import is `@lodado/eslint-config/design`. Enable it only where
the Tailwind theme really defines the scale an arbitrary value is escaping.

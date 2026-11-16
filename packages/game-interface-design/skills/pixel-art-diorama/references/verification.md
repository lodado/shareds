# Verification

## What runs where

| Check                                  | Where                           | Proves                                        |
| -------------------------------------- | ------------------------------- | --------------------------------------------- |
| Camera, cutaway, palette, board, clock | jsdom unit tests                | the pure maths and their boundaries           |
| Bake and instancing                    | jsdom unit tests                | geometry and matrices (no WebGL needed)       |
| Whole simulation                       | unit scenario test              | a seeded match reaches its end, score = goals |
| Look, cutaway, surfaces, light, layout | headless Chromium + SwiftShader | what the screen shows                         |
| Frame cost                             | the same browser, frame probe   | relative cost of a change                     |
| Phone GPU performance, touch           | a real phone                    | `NOT_RUN` unless one was used                 |

jsdom has no WebGL: do not construct the renderer in unit tests; build scene objects and check them.

## Headless browser

- Run against the production build (`vite build` + `vite preview`), not the dev server.
- Chromium flags: `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- If the installed Playwright wants a browser version that is not downloaded, point
  `executablePath` at a headless shell that is already on the machine; do not download browsers
  without the user's say-so.
- Ignore `GPU stall due to ReadPixels` warnings: screenshots cause them. Any other console warning or
  error from the app is a finding (three.js warnings included; a `toNonIndexed()` on an already
  non-indexed geometry was one).

## Two verdicts

A scene can look right and do nothing, or work and look like a test fixture. Report both, each `PASS`,
`FAIL` or `NOT_RUN` with its evidence; one never stands in for the other.

`LOOK`: the [direction sheet](art-direction.md) read against the screenshots, row by row.

- The reading order holds in the wide and follow modes: the first thing the sheet names is the first
  thing found.
- A person and the smallest thing that must read are the pixel sizes the sheet gives.
- The accent appears only on what the sheet allows.
- All four tiers of [world dressing](world-dressing.md) are present, densest round the stage, and the
  stage floor is clear.
- The stage is whole in every rotation, and nothing hangs in the air where a wall dropped.
- No row shares its value with the worked example without a reason on the sheet.

### Critique passes

Run passes 1, 2, 3 and 5 on the blockout shots and all six on the dressed scene, shooting the wide
and follow modes in the hero rotation and the other three. Each has a question and a smallest fix;
apply the fix, shoot again, and write what changed on the report.

1. **Squint**: shrink the wide shot to a quarter of its width. Are ground, stage and landmark three
   shapes, and is the first thing seen the sheet's first row? Fix: raise the stage's contrast or lower
   what competes with it.
2. **Grayscale**: convert to grey. Does the stage hold the widest value range, and do the contrast
   pairs still separate? Fix: move one entry of the pair by a ramp step in value.
3. **Silhouette**: fill the landmark with one flat colour. Is it still recognisable? Fix: change its
   outline, not its colour.
4. **Accent and colour**: is the accent only on what the sheet allows, within about 3–10% of the stage
   zone, and does each ramp show three distinct entries? Fix: mute the nearest competing ramp.
5. **Rotation**: all four. Is the stage whole, the landmark naming the place, nothing hanging where a
   wall dropped, and the hero rotation clearly the best? Fix: move, lower or add to the cutaway.
6. **Pixel zoom**: view at 100%. Any lone pixels, parallel bands, pillow shading, outline stripes on
   floors, or things under two pixels? Fix: the matching rule in [pixel craft](pixel-craft.md).

`LOOK` fails if a pass was skipped or a fix was not applied. The passes are by eye; they catch the
usual faults, not taste. A pixel count of one palette entry can be read from a screenshot in a
throwaway script when a number is wanted; no script ships with this skill.

`FUNCTION`: every claim the page makes, checked against state.

- Each control changes what its label says, and its pressed state follows.
- Every number on the page equals the simulation's value at that moment.
- The simulation reaches its end through the debug hook.
- Each camera mode and rotation can be reached from the keyboard.

## Screenshot checklist

Look at every image; a passing script only proves nothing crashed.

- Every surface in the wide view; every time of day; all four rotations (check that the near cage
  sides drop and the far ones stay); the close and follow modes.
- No flicker or coloured patches on large flat areas after a surface switch at each time of day
  (z-fighting).
- People, ball and markers stand on the floor, not sunk into it or floating.
- Outlines on silhouettes only, not striping flat floors in the wide view.
- The island underside is in frame in the wide view.
- At night the lamps' lit faces, the floodlit court and the windows' glow read.
- Page at 375 and 320 px: `document.documentElement.scrollWidth === innerWidth`.
- The match reaches its end through `simulate()` and the board shows the same score as the page.

`shoot.cjs` and `perf.cjs` take their two machine-specific paths from environment
variables (`PLAYWRIGHT`, `CHROME`); `URL` defaults to the preview at port 5191.

```js
// qa/shoot.cjs
// Headless QA for the diorama: console errors, screenshots per surface/time/rotation, full match, layout widths.
// PLAYWRIGHT: path to an installed playwright package (the original used one already in the monorepo)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const path = require('node:path')

const URL = process.env.URL || 'http://localhost:5191/'
const OUT = path.join(__dirname, 'shots')
const only = process.argv[2] || 'all'

;(async () => {
  require('node:fs').mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({
    // CHROME: an already-downloaded headless shell when its version differs from the package's
    executablePath: process.env.CHROME || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto(URL)
  await page.waitForFunction(() => window.__yard, null, { timeout: 15000 })
  await page.waitForTimeout(1500)
  const stage = page.locator('canvas')
  const shot = async (name) => {
    await page.waitForTimeout(700)
    await stage.screenshot({ path: path.join(OUT, `${name}.png`) })
  }

  await shot('00-walkout')
  // into first-half play
  await page.evaluate(() => window.__yard.simulate(70))
  await shot('01-play-tv')
  console.log('info', JSON.stringify(await page.evaluate(() => window.__yard.info())))
  console.log(
    'snap',
    JSON.stringify(
      await page.evaluate(() => {
        const s = window.__yard.snapshot()
        return { phase: s.phase, clock: s.clockText, score: s.score, live: s.live }
      }),
    ),
  )

  if (only === 'all' || only === 'surfaces') {
    await page.getByRole('button', { name: 'Whole yard' }).click()
    for (const s of ['Rubber', 'Asphalt', 'Turf', 'Parquet']) {
      await page.getByRole('button', { name: s, exact: true }).click()
      await shot(`10-yard-${s.toLowerCase()}`)
    }
    await page.getByRole('button', { name: 'Rubber', exact: true }).click()
    for (const t of ['Dusk', 'Night', 'Day']) {
      await page.getByRole('button', { name: t, exact: true }).click()
      await shot(`20-yard-${t.toLowerCase()}`)
    }
    for (let i = 1; i <= 4; i++) {
      await page.getByRole('button', { name: 'Rotate right' }).click()
      await page.waitForTimeout(900)
      await shot(`30-yard-rot${i}`)
      console.log('rot', i, JSON.stringify(await page.evaluate(() => window.__yard.info().nearSides)))
    }
    await page.getByRole('button', { name: 'Close-up' }).click()
    await shot('40-close')
    await page.getByRole('button', { name: 'TV follow' }).click()
    await page.getByRole('button', { name: 'Night', exact: true }).click()
    await shot('41-tv-night')
    await page.getByRole('button', { name: 'Day', exact: true }).click()
  }

  // full match to the end
  const fin = await page.evaluate(() => window.__yard.simulate(2000))
  await page.waitForTimeout(800)
  console.log(
    'final',
    JSON.stringify({ phase: fin.phase, clock: fin.clockText, score: fin.score, finished: fin.finished }),
  )
  const scoreText = await page
    .locator('main')
    .getByText(/^\d+–\d+$/)
    .first()
    .textContent()
  console.log('scoreline', scoreText)
  await page.getByRole('button', { name: 'Whole yard' }).click()
  await shot('50-fulltime-yard')

  await page.screenshot({ path: path.join(OUT, '60-page-1280.png'), fullPage: true })
  for (const w of [375, 320]) {
    await page.setViewportSize({ width: w, height: 800 })
    await page.waitForTimeout(600)
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
    console.log('width', w, JSON.stringify(m))
    await page.screenshot({ path: path.join(OUT, `61-page-${w}.png`), fullPage: true })
  }
  console.log('errors', errors.length)
  for (const e of errors.slice(0, 20)) console.log('  ', e)
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

```js
// qa/perf.cjs
// Perf probe for the diorama: per-frame CPU time of RAF callbacks, frame interval, draw calls.
// Usage: node perf.cjs [label]
// PLAYWRIGHT: path to an installed playwright package (the original used one already in the monorepo)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')

const URL = process.env.URL || 'http://localhost:5191/'
const label = process.argv[2] || 'run'

;(async () => {
  const browser = await chromium.launch({
    // CHROME: an already-downloaded headless shell when its version differs from the package's
    executablePath: process.env.CHROME || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window)
    window.__perf = { cpu: [], at: [] }
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        const s = performance.now()
        cb(t)
        window.__perf.cpu.push(performance.now() - s)
        window.__perf.at.push(s)
      })
  })
  await page.goto(URL)
  await page.waitForFunction(() => window.__yard, null, { timeout: 15000 })
  await page.evaluate(() => window.__yard.simulate(70))
  await page.waitForTimeout(1500)

  const sample = async (name) => {
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      window.__perf.cpu = []
      window.__perf.at = []
    })
    await page.waitForTimeout(4000)
    const r = await page.evaluate(() => {
      const { cpu, at } = window.__perf
      const sorted = [...cpu].sort((a, b) => a - b)
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
      const gaps = at.slice(1).map((t, i) => t - at[i])
      const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
      return {
        frames: cpu.length,
        cpuMean: +mean(cpu).toFixed(2),
        cpuP50: +q(0.5).toFixed(2),
        cpuP95: +q(0.95).toFixed(2),
        intervalMean: +mean(gaps).toFixed(2),
        info: window.__yard.info(),
      }
    })
    console.log(label, name, JSON.stringify({ ...r, info: { calls: r.info.calls, tris: r.info.triangles } }))
  }

  await sample('tv-day')
  await page.getByRole('button', { name: 'Whole yard' }).click()
  await sample('yard-day')
  await page.getByRole('button', { name: 'Night', exact: true }).click()
  await sample('yard-night')
  await page.getByRole('button', { name: 'Day', exact: true }).click()
  // scrolled away: the stage is off screen
  await page.setViewportSize({ width: 375, height: 700 })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await sample('offscreen-375')
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

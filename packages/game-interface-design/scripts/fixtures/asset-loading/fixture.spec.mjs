import { expect, test } from '@playwright/test'

const observations = new WeakMap()
const inspect = (page) => page.evaluate(() => window.assetFixture.inspect())
const status = (page, text) => expect(page.getByRole('status')).toHaveText(text)
const click = (page, name) => page.getByRole('button', { name, exact: true }).click()
const count = (context, id) => context.requests.filter((url) => url === context.registry[id].url).length

async function open(page) {
  const requests = []
  const errors = []
  page.on('request', (request) => requests.push(request.url()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const registry = await page.evaluate(() => window.assetFixture.registry)
  for (const asset of Object.values(registry)) asset.url = new URL(asset.url, page.url()).href
  const context = { requests, registry, errors }
  observations.set(page, context)
  await status(page, 'home')
  return context
}

async function hold(page, url) {
  const started = Promise.withResolvers()
  const response = Promise.withResolvers()
  await page.route(url, async (route) => {
    started.resolve()
    await response.promise
    await route.continue()
  })
  return { started: started.promise, release: response.resolve }
}

test.afterEach(async ({ page }, info) => {
  const context = observations.get(page)
  if (!context) return
  await info.attach('asset-observations', {
    body: JSON.stringify({ ...context, state: await inspect(page) }, null, 2),
    contentType: 'application/json',
  })
  expect(context.errors).toEqual([])
})

test('cold 2D home and registry import cause no GLB, texture or parse activity', async ({ page }) => {
  const context = await open(page)
  for (const id of Object.keys(context.registry)) expect(count(context, id)).toBe(0)
  expect(context.requests.filter((url) => url.endsWith('/models/pixel.png'))).toEqual([])
  expect((await inspect(page)).parses).toEqual({})
  expect((await inspect(page)).cacheSize).toBe(0)
})

test('play gates attachment on required assets and A never loads unselected B', async ({ page }) => {
  const context = await open(page)
  await click(page, 'Character A')
  for (const id of Object.keys(context.registry)) expect(count(context, id)).toBe(0)
  const map = await hold(page, context.registry.map.url)
  await click(page, 'Play')
  await map.started
  await expect.poll(async () => (await inspect(page)).completedLoads.characterA).toBe(1)
  await status(page, 'loading play')
  expect((await inspect(page)).activeIds).toEqual([])
  map.release()
  await status(page, 'ready play')
  expect((await inspect(page)).activeIds).toEqual(['map', 'characterA'])
  expect((await inspect(page)).parses).toEqual({ characterA: 1, map: 1 })
  expect(count(context, 'characterA')).toBe(1)
  expect(count(context, 'map')).toBe(1)
  expect(count(context, 'characterB')).toBe(0)
  expect(count(context, 'skin')).toBe(0)
})

test('skin detail loads only the skin and its declared external texture', async ({ page }) => {
  const context = await open(page)
  await click(page, 'Skin detail')
  await status(page, 'ready detail')
  expect((await inspect(page)).parses).toEqual({ skin: 1 })
  expect(count(context, 'skin')).toBe(1)
  for (const id of ['map', 'characterA', 'characterB']) expect(count(context, id)).toBe(0)
  const dependencies = context.requests.filter((url) => url === new URL('/models/pixel.png', page.url()).href)
  expect(dependencies).toHaveLength(1)
  expect((await inspect(page)).resources.textures).toBe(1)
})

test('simultaneous consumers share one request and parse, but own independent materials', async ({ page }) => {
  const context = await open(page)
  await click(page, 'Two A consumers')
  await status(page, 'ready pair')
  expect(count(context, 'characterA')).toBe(1)
  expect((await inspect(page)).parses).toEqual({ characterA: 1 })
  expect((await inspect(page)).activeIds).toEqual(['characterA', 'characterA'])
  await click(page, 'Tint one consumer')
  expect((await inspect(page)).instanceColors).toEqual(['ff0000', 'ffffff'])
  await click(page, 'Release one consumer')
  await click(page, 'Evict idle assets')
  const remaining = await inspect(page)
  expect(remaining.leaseCount).toBe(1)
  expect(remaining.activeIds).toEqual(['characterA'])
  expect(remaining.disposed.geometries).toBe(0)
  expect(remaining.disposed.textures).toBe(0)
})

test('pending consumers prevent premature eviction and final release disposes owned resources', async ({ page }) => {
  const context = await open(page)
  const a = await hold(page, context.registry.characterA.url)
  await click(page, 'Two A consumers')
  await a.started
  expect((await inspect(page)).leaseCount).toBe(2)
  await click(page, 'Release one consumer')
  await click(page, 'Evict idle assets')
  expect((await inspect(page)).leaseCount).toBe(1)
  a.release()
  await status(page, 'ready pair')
  expect((await inspect(page)).activeIds).toEqual(['characterA'])
  expect(count(context, 'characterA')).toBe(1)
  expect((await inspect(page)).parses.characterA).toBe(1)
  await click(page, 'Home')
  await click(page, 'Evict idle assets')
  const final = await inspect(page)
  expect(final.leaseCount).toBe(0)
  expect(final.resources).toEqual({ geometries: 0, materials: 0, textures: 0 })
  expect(final.disposed).toEqual({ geometries: 1, materials: 2, textures: 1 })
})

test('warm re-entry reuses retained results without another fetch or parse', async ({ page }) => {
  const context = await open(page)
  await click(page, 'Play')
  await status(page, 'ready play')
  const before = await inspect(page)
  await click(page, 'Home')
  await status(page, 'home')
  expect((await inspect(page)).idleCount).toBe(2)
  await click(page, 'Play')
  await status(page, 'ready play')
  expect((await inspect(page)).parses).toEqual(before.parses)
  expect(count(context, 'map')).toBe(1)
  expect(count(context, 'characterA')).toBe(1)
})

// Both explicit orderings: no fast-check dependency is installed or needed for these two fixed barriers.
for (const order of ['A first', 'B first']) {
  test(`selection A to B preserves B with ${order} response order`, async ({ page }) => {
    const context = await open(page)
    const a = await hold(page, context.registry.characterA.url)
    const b = await hold(page, context.registry.characterB.url)
    await click(page, 'Play')
    await a.started
    await click(page, 'Character B')
    await b.started
    const baseline = (await inspect(page)).settled
    if (order === 'A first') {
      a.release()
      await expect.poll(async () => (await inspect(page)).settled).toBe(baseline + 1)
      await status(page, 'loading play')
      expect((await inspect(page)).activeIds).toEqual([])
      b.release()
    } else {
      b.release()
      await status(page, 'ready play')
      a.release()
    }
    await expect.poll(async () => (await inspect(page)).settled).toBe(baseline + 2)
    await status(page, 'ready play')
    const state = await inspect(page)
    expect(state.activeIds).toEqual(['map', 'characterB'])
    expect(state.parses).toEqual({ map: 1, characterA: 1, characterB: 1 })
    expect(state.leaseCount).toBe(2)
    for (const id of ['map', 'characterA', 'characterB']) expect(count(context, id)).toBe(1)
  })
}

test('late successful response after exit is processed without reviving the exited screen', async ({ page }) => {
  const context = await open(page)
  const a = await hold(page, context.registry.characterA.url)
  await click(page, 'Play')
  await a.started
  await click(page, 'Home')
  await status(page, 'home')
  const baseline = (await inspect(page)).settled
  a.release()
  await expect.poll(async () => (await inspect(page)).settled).toBe(baseline + 1)
  const state = await inspect(page)
  expect(state.completedLoads.characterA).toBe(1)
  expect(state.activeIds).toEqual([])
  expect(state.leaseCount).toBe(0)
  await status(page, 'home')
})

test('partial failure keeps successful assets and retries only the failed required model', async ({ page }) => {
  const context = await open(page)
  const failure = Promise.withResolvers()
  await page.route(context.registry.map.url, async (route) => {
    await failure.promise
    await route.fulfill({ status: 503, body: 'fixture failure' })
  }, { times: 1 })
  await click(page, 'Play')
  await expect.poll(async () => (await inspect(page)).completedLoads.characterA).toBe(1)
  failure.resolve()
  await status(page, 'error play')
  await expect(page.getByRole('alert')).toContainText('Load failed')
  expect((await inspect(page)).activeIds).toEqual([])
  await click(page, 'Retry')
  await status(page, 'ready play')
  await expect(page.getByRole('alert')).toBeEmpty()
  expect(count(context, 'map')).toBe(2)
  expect(count(context, 'characterA')).toBe(1)
  expect(count(context, 'characterB')).toBe(0)
  expect(count(context, 'skin')).toBe(0)
  expect((await inspect(page)).parses).toEqual({ characterA: 1, map: 1 })
})

test('failure allows safe exit without retrying or activating missing models', async ({ page }) => {
  const context = await open(page)
  await page.route(context.registry.skin.url, (route) => route.fulfill({ status: 503, body: 'fixture failure' }))
  await click(page, 'Skin detail')
  await status(page, 'error detail')
  await click(page, 'Home')
  await status(page, 'home')
  expect(count(context, 'skin')).toBe(1)
  expect((await inspect(page)).activeIds).toEqual([])
  expect((await inspect(page)).leaseCount).toBe(0)
})

test('a failed required texture cannot silently pass readiness and can be retried', async ({ page }) => {
  const context = await open(page)
  await page.route(new URL('/models/pixel.png', page.url()).href,
    (route) => route.fulfill({ status: 503, body: 'fixture texture failure' }), { times: 1 })
  await click(page, 'Skin detail')
  await status(page, 'error detail')
  expect((await inspect(page)).activeIds).toEqual([])
  await expect(page.getByRole('alert')).toContainText('Required texture unavailable')
  await click(page, 'Retry')
  await status(page, 'ready detail')
  expect(count(context, 'skin')).toBe(2)
  expect((await inspect(page)).parses).toEqual({ skin: 2 })
  expect((await inspect(page)).resources.textures).toBe(1)
})

test('repeated distinct selections plateau within two idle entries and really evict resources', async ({ page }) => {
  await open(page)
  const snapshots = []
  // Three rounds over four assets exceed the two-entry idle limit and revisit after eviction.
  for (let round = 0; round < 3; round++) {
    for (const selection of ['Character A', 'Character B']) {
      await click(page, selection)
      await click(page, 'Play')
      await status(page, 'ready play')
      await click(page, 'Home')
    }
    await click(page, 'Skin detail')
    await status(page, 'ready detail')
    await click(page, 'Home')
    const state = await inspect(page)
    expect(state.idleCount).toBe(2)
    expect(state.cacheSize).toBe(2)
    expect(state.leaseCount).toBe(0)
    expect(state.resources).toEqual({ geometries: 2, materials: 2, textures: 2 })
    snapshots.push(state)
  }
  expect(snapshots[2].gpu).toEqual(snapshots[1].gpu)
  expect(snapshots[2].disposed.geometries).toBeGreaterThan(snapshots[1].disposed.geometries)
  expect(snapshots[2].disposed.textures).toBeGreaterThan(snapshots[1].disposed.textures)
  await click(page, 'Evict idle assets')
  const final = await inspect(page)
  expect(final.cacheSize).toBe(0)
  expect(final.resources).toEqual({ geometries: 0, materials: 0, textures: 0 })
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package tests intentionally use node --test.
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { resolvePlaywright, scanSourceText } from '../skills/frontend-interface-design/scripts/render.mjs'

const directory =
  process.env.FID_EXEMPLAR_DIR ??
  join(dirname(dirname(fileURLToPath(import.meta.url))), 'skills/frontend-interface-design/exemplars/compositions')
const examples = ['editorial-signal-ledger', 'image-orbit-rail', 'color-pathway']

test('signature exemplars use real component tokens within the literal budget', async () => {
  for (const example of examples) {
    const counts = scanSourceText(await readFile(join(directory, `${example}.html`), 'utf8'))
    assert.ok(counts.tokenReferences > 0, `${example}: no component token references`)
    const ratio = counts.literalValues / (counts.literalValues + counts.tokenReferences)
    assert.ok(ratio <= 0.1, `${example}: literal ratio ${ratio} exceeds 0.1`)
  }
})

async function activate(page, button, key = 'Enter') {
  for (let step = 0; step < 30; step += 1) {
    if (await button.evaluate((element) => element === document.activeElement)) {
      await page.keyboard.press(key)
      return
    }
    await page.keyboard.press('Tab')
  }
  assert.fail(`Button not reachable by Tab: ${await button.textContent()}`)
}

test(
  'signature interactions support keyboard recovery and equal reduced-motion outcomes',
  { timeout: 60_000 },
  async (t) => {
    if (!process.env.FID_PLAYWRIGHT_DIR) {
      t.skip('FID_PLAYWRIGHT_DIR is not set: no Playwright module directory to render with')
      return
    }
    const { chromium } = await resolvePlaywright()
    assert.ok(chromium, 'Playwright Chromium must resolve when browser tests are enabled')
    const browser = await chromium.launch({ executablePath: process.env.FID_CHROMIUM_EXECUTABLE })
    t.after(() => browser.close())
    const outcomes = []
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width: 375, height: 900 }, reducedMotion })
      const page = await context.newPage()
      page.setDefaultTimeout(5_000)
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      const states = []
      for (const example of examples) {
        await page.goto(pathToFileURL(join(directory, `${example}.html`)).href)
        await page.evaluate(() => document.fonts.ready)
        if (example === 'editorial-signal-ledger') {
          const city = page.getByRole('button', { name: '도시', exact: true })
          await activate(page, city)
          assert.equal(await city.getAttribute('aria-pressed'), 'true')
          assert.equal(await page.locator('[data-topic]:visible').count(), 2)
          assert.equal(await page.locator('[data-topic="people"]').isVisible(), false)
          assert.match(await page.locator('#filter-result').textContent(), /도시.*2편/)
          await activate(page, page.getByRole('button', { name: '모두', exact: true }), 'Space')
          assert.equal(await page.locator('[data-topic]:visible').count(), 3)
          states.push(await page.locator('#filter-result').textContent())
        } else if (example === 'image-orbit-rail') {
          const items = page.locator('.rail button')
          await activate(page, page.getByRole('button', { name: 'Next object', exact: true }))
          assert.equal(await page.locator('#count').textContent(), '2 of 5')
          assert.equal(await page.locator('#label').textContent(), await items.nth(1).getAttribute('data-name'))
          assert.equal(await items.nth(1).getAttribute('aria-pressed'), 'true')
          await activate(page, page.getByRole('button', { name: 'Previous object', exact: true }), 'Space')
          assert.equal(await page.locator('#count').textContent(), '1 of 5')
          await activate(page, items.nth(4))
          assert.equal(await page.locator('#count').textContent(), '5 of 5')
          assert.equal(await items.nth(4).getAttribute('aria-pressed'), 'true')
          await activate(page, items.first(), 'Space')
          assert.equal(await page.locator('#count').textContent(), '1 of 5')
          await page
            .locator('#object')
            .evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
          if (reducedMotion === 'reduce') {
            assert.equal(
              await page.locator('#object').evaluate((element) => getComputedStyle(element).transitionDuration),
              '0s',
            )
          }
          states.push(await page.locator('#label').textContent())
        } else {
          const choices = page.locator('.choice')
          await activate(page, choices.nth(1), 'Space')
          assert.equal(await choices.nth(1).getAttribute('aria-pressed'), 'true')
          assert.equal(
            await page.locator('#detail strong').textContent(),
            await choices.nth(1).getAttribute('data-title'),
          )
          assert.equal(
            await page.locator('#detail span').textContent(),
            await choices.nth(1).getAttribute('data-detail'),
          )
          await activate(page, page.getByRole('button', { name: 'Reset selection', exact: true }))
          assert.equal(await choices.first().getAttribute('aria-pressed'), 'true')
          assert.equal(await choices.nth(1).getAttribute('aria-pressed'), 'false')
          assert.equal(
            await page.locator('#detail strong').textContent(),
            await choices.first().getAttribute('data-title'),
          )
          states.push(await page.locator('#detail').textContent())
        }
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${example}: horizontal overflow at 375`,
        )
        assert.equal(await page.locator('button:disabled').count(), 0, `${example}: recovery left an input disabled`)
      }
      assert.deepEqual(errors, [], `${reducedMotion}: page errors`)
      outcomes.push(states)
      await context.close()
    }
    assert.deepEqual(outcomes[0], outcomes[1], 'Reduced motion must preserve the final interaction states')
  },
)

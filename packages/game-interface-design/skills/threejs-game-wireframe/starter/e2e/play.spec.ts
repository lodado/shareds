import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('start, fail, retry and pause through real input', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const hud = page.locator('.play-hud')
  const canvas = page.locator('.play-canvas')
  await expect(canvas).toBeVisible()
  await expect(hud).toHaveAttribute('data-status', 'ready')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(hud).toHaveAttribute('data-status', 'playing')
  const firstRun = await hud.getAttribute('data-run-id')

  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(hud).toHaveAttribute('data-paused', 'true')
  await expect(hud.locator('.hud-status')).toHaveText('Paused')
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(hud).toHaveAttribute('data-paused', 'false')

  // Each new block spawns at the far edge of its travel, so back-to-back taps miss within a few drops.
  await expect(async () => {
    await canvas.tap()
    await expect(hud).toHaveAttribute('data-status', 'failed', { timeout: 250 })
  }).toPass({ timeout: 5000 })
  await expect(hud.locator('.hud-status')).toHaveText('Missed')

  await page.getByRole('button', { name: /Retry/ }).click()
  await expect(hud).toHaveAttribute('data-status', 'ready')
  expect(await hud.getAttribute('data-run-id')).not.toBe(firstRun)
  await canvas.tap()
  await expect(hud).toHaveAttribute('data-status', 'playing')

  await expectNoHorizontalOverflow(page)
  expect(errors).toEqual([])
})

test('hidden tab pauses and a visible tab resumes', async ({ page }) => {
  await page.goto('/')
  const hud = page.locator('.play-hud')
  await page.locator('.play-canvas').tap()
  await expect(hud).toHaveAttribute('data-status', 'playing')
  const setHidden = (hidden: boolean): Promise<void> =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  await setHidden(true)
  await expect(hud).toHaveAttribute('data-paused', 'true')
  await setHidden(false)
  await expect(hud).toHaveAttribute('data-paused', 'false')
})

test('small screen and resize keep the HUD inside the viewport', async ({ page }) => {
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start' })).toBeInViewport()
  await page.setViewportSize({ width: 568, height: 320 })
  await expect(page.getByRole('button', { name: 'Start' })).toBeInViewport()
  const canvas = await page.locator('.play-canvas').boundingBox()
  expect(canvas?.height).toBeGreaterThan(0)
  await expectNoHorizontalOverflow(page)
  expect(errors).toEqual([])
})

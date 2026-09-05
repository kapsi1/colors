import { test, expect } from '@playwright/test'

test('the reset button returns the camera to the startup pose', async ({ page }) => {
  await page.goto('http://localhost:5173/#k=16')
  await page.waitForFunction(() => window.__cube?.renders > 0)
  const start = await page.evaluate(() => [...window.__cube.cam.pos])
  await page.keyboard.down('w')
  await page.waitForTimeout(400)
  await page.keyboard.up('w')
  const moved = await page.evaluate(() => [...window.__cube.cam.pos])
  expect(Math.hypot(moved[0] - start[0], moved[1] - start[1], moved[2] - start[2])).toBeGreaterThan(1)
  await page.locator('#reset').click()
  await expect.poll(() =>
    page.evaluate((s) => {
      const p = window.__cube.cam.pos
      return Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2])
    }, start),
  ).toBeLessThan(0.01)
  // The settings chrome and the reset button hide together with the HUD.
  await page.keyboard.press('h')
  await expect(page.locator('#reset')).toBeHidden()
  await expect(page.locator('#gear')).toBeHidden()
  await page.keyboard.press('h')
  await expect(page.locator('#reset')).toBeVisible()
})

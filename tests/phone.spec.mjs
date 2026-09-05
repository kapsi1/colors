import { test, expect } from '@playwright/test'

test('phone mode shows the slider, hides desktop chrome, and persists', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:5173/#phone=1&k=16')
  await page.waitForFunction(() => window.__cube?.renders > 0)
  await expect(page.locator('#speed-slider')).toBeVisible()
  await expect(page.locator('#speedo')).toBeHidden()
  await expect(page.locator('#help')).toBeHidden()
  await expect(page.locator('#hint')).toBeHidden()

  // The color model control sits to the right of the color display, on the
  // same row, inside a box that spans most of the screen width.
  const boxes = await page.evaluate(() => {
    const rect = (id) => document.getElementById(id).getBoundingClientRect()
    return { info: rect('info'), cam: rect('info-cam'), model: rect('color-model') }
  })
  expect(boxes.model.left).toBeGreaterThan(boxes.cam.right - 1)
  const camMid = boxes.cam.top + boxes.cam.height / 2
  const modelMid = boxes.model.top + boxes.model.height / 2
  expect(Math.abs(modelMid - camMid)).toBeLessThan(24)
  expect(boxes.info.width).toBeGreaterThan(boxes.info.height * 3)

  // Dragging the slider down lowers the speed and updates the readout.
  const track = await page.locator('#speed-track').boundingBox()
  await page.mouse.move(track.x + track.width / 2, track.y + track.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(track.x + track.width / 2, track.y + track.height * 0.8, { steps: 5 })
  await page.mouse.up()
  const speed = await page.evaluate(() => window.__cube.config.baseSpeed)
  expect(speed).toBeLessThan(5)
  await expect.poll(() => page.locator('#speed-value').textContent()).toBe(speed < 10 ? speed.toFixed(1) : String(Math.round(speed)))

  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/phone=1/)
  expect(errors).toEqual([])
})

test('a touch held on the canvas moves the camera forward', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:5173/#phone=1&k=16')
  await page.waitForFunction(() => window.__cube?.renders > 0)
  const distance = await page.evaluate(async () => {
    const canvas = document.getElementById('view')
    const before = [...window.__cube.cam.pos]
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      pointerType: 'touch', pointerId: 1, button: 0, clientX: 200, clientY: 400, bubbles: true,
    }))
    await new Promise((resolve) => setTimeout(resolve, 400))
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      pointerType: 'touch', pointerId: 1, button: 0, clientX: 200, clientY: 400, bubbles: true,
    }))
    const after = [...window.__cube.cam.pos]
    return Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])
  })
  expect(distance).toBeGreaterThan(1)
})

test('phone mode auto-detects touch viewports and phone=0 opts out', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.goto('http://localhost:5173/#k=16')
  await page.waitForFunction(() => window.__cube?.renders > 0)
  expect(await page.evaluate(() => window.__cube.config.phoneMode)).toBe(true)
  await expect(page.locator('#speed-slider')).toBeVisible()
  await page.goto('http://localhost:5173/#phone=0')
  await page.reload()
  await page.waitForFunction(() => window.__cube?.renders > 0)
  expect(await page.evaluate(() => window.__cube.config.phoneMode)).toBe(false)
  await expect(page.locator('#speed-slider')).toBeHidden()
  await expect(page.locator('#speedo')).toBeVisible()
  await context.close()
})

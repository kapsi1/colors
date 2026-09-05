import { test, expect } from '@playwright/test'

test('HUD switches models, updates minimap, persists links and restores RGB', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://localhost:5173/#k=16&fog=0')
  await page.waitForFunction(() => window.__cube?.renders > 0)
  const canvas = page.locator('#view')
  let previous = await canvas.screenshot()
  for (const model of ['HSL', 'HSV', 'RGB']) {
    await page.getByRole('radio', { name: model, exact: true }).check()
    await expect(page.locator('#minimap')).toHaveAttribute('aria-label', new RegExp(model))
    await expect.poll(() => page.evaluate(() => window.__cube.config.colorModel)).toBe(model.toLowerCase())
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(model === 'RGB' ? /^(?!.*model=)/ : new RegExp(`model=${model.toLowerCase()}`))
    const current = await canvas.screenshot()
    expect(current.equals(previous)).toBe(false)
    previous = current
    await page.reload()
    await expect(page.getByRole('radio', { name: model, exact: true })).toBeChecked()
    expect(await page.evaluate(() => window.__cube.gl.getError())).toBe(0)
  }
  await page.locator('#view').click({ position: { x: 400, y: 300 } })
  await page.keyboard.press('h')
  await expect(page.locator('#color-model')).toBeHidden()
  expect(errors).toEqual([])
})

test('GPU point colors match CPU near spheres; cylinder corners are clipped', async ({ page }) => {
  await page.goto('http://localhost:5173/#k=16')
  const result = await page.evaluate(async () => {
    const config = window.__cube.config
    const { modelColor } = await import('/src/colorModel.ts')
    const { SphereQuads } = await import('/src/renderer/sphereQuads.ts')
    const { default: source } = await import('/src/renderer/shaders/points.vert.glsl?raw')
    const gl = document.createElement('canvas').getContext('webgl2')
    const compile = (type, source) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader))
      return shader
    }
    const program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, source))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; out vec4 color; void main(){color=vec4(1.0);}'))
    gl.transformFeedbackVaryings(program, ['vColor', 'gl_Position'], gl.INTERLEAVED_ATTRIBS)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program))
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buf)
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 28, gl.DYNAMIC_READ)
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buf)
    gl.useProgram(program)
    const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    for (const name of ['uView', 'uProj']) gl.uniformMatrix4fv(gl.getUniformLocation(program, name), false, identity)
    for (const [name, value] of Object.entries({ uK: 1, uLatticeHalf: 127.5, uLatticeMax: 255, uSpacing: 1, uRadius: .2, uProjScale: 100, uMaxPoint: 64, uTanHalf: 1, uAspect: 1 })) gl.uniform1f(gl.getUniformLocation(program, name), value)
    gl.enable(gl.RASTERIZER_DISCARD)
    let maxError = 0
    const clipped = []
    for (const [mode, model] of ['rgb', 'hsl', 'hsv'].entries()) {
      gl.uniform1i(gl.getUniformLocation(program, 'uColorModel'), mode)
      for (const p of [[1,0,0], [0,1,1], [-1,0,0], [0,0,-1], [.2,-.3,.4], [0,0,0], [1,0,1]]) {
        gl.vertexAttrib3f(gl.getAttribLocation(program, 'aChunkOffset'), ...p.map(v => (v + 1) * 127.5))
        gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, 1); gl.endTransformFeedback()
        const data = new Float32Array(7)
        gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, data)
        if (mode && p[0] === 1 && p[2] === 1) clipped.push(data[3] > data[6])
        else modelColor(...p, model).forEach((v, i) => maxError = Math.max(maxError, Math.abs((mode === 0 ? Math.round(v * 255) / 255 : v) - data[i])))
      }
    }
    gl.disable(gl.RASTERIZER_DISCARD)
    const quads = new SphereQuads(gl)
    const counts = [], colors = []
    for (const model of ['rgb', 'hsl', 'hsv']) {
      config.colorModel = model
      const count = quads.build([127.5, 0.5, 127.5], 1, 1, 1024)
      counts.push(count)
      quads.build([0.5, 0.5, 0.5], 1, 1, 1024)
      const data = quads.data
      const expected = modelColor(data[0] / 127.5, data[1] / 127.5, data[2] / 127.5, model)
      colors.push(expected.every((v, i) => Math.abs(v - data[i + 3]) < 1e-6))
    }
    return { maxError, clipped, counts, colors, error: gl.getError() }
  })
  expect(result.maxError).toBeLessThan(1e-5)
  expect(result.clipped).toEqual([true, true])
  expect(result.counts[0]).toBeGreaterThan(0)
  expect(result.counts.slice(1)).toEqual([0, 0])
  expect(result.colors).toEqual([true, true, true])
  expect(result.error).toBe(0)
})

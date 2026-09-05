import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { mat4 } from 'gl-matrix'
import { load } from './loadTs.mjs'

const shader = name => readFileSync(new URL(`../src/renderer/shaders/${name}`, import.meta.url), 'utf8')
const sources = {
  vertex: shader('outline.vert.glsl'),
  fragment: shader('outline.frag.glsl'),
}
const { config } = await load('../src/config.ts')
const { buildOutlineEdges, fillOutlineQuads } = await load('../src/renderer/outlineGeometry.ts')

config.spacing = 1
config.radius = 0.2

function scene(eye) {
  const view = mat4.lookAt(mat4.create(), eye, [0, 0, 0], [0, 1, 0])
  const proj = mat4.perspective(mat4.create(), (60 * Math.PI) / 180, 1, 0.5, 600)
  const quads = new Float32Array(12 * 6 * 7)
  const count = fillOutlineQuads(buildOutlineEdges(config.spacing), view, 0.5, quads)
  return { sources, view: Array.from(view), proj: Array.from(proj), quads: Array.from(quads), count }
}

// Renders the quads over a white 160x160 canvas and measures pixels. The
// center column (x=80) intersects exactly the two x-axis edges that span the
// screen horizontally, so their vertical runs measure the ribbon width.
async function render(page, eye) {
  const payload = scene(eye)
  return page.evaluate(({ sources, view, proj, quads, count }) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 160
    const gl = canvas.getContext('webgl2', { antialias: false })
    if (!gl) throw new Error('WebGL2 is required for rendering regression tests')
    const compile = (type, source) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
      return shader
    }
    const program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, sources.vertex))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, sources.fragment))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
    gl.useProgram(program)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    const u = name => gl.getUniformLocation(program, name)
    gl.uniformMatrix4fv(u('uView'), false, view)
    gl.uniformMatrix4fv(u('uProj'), false, proj)
    gl.uniform2f(u('uViewport'), canvas.width, canvas.height)
    gl.uniform1f(u('uWidth'), 3)
    gl.clearColor(1, 1, 1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quads), gl.STATIC_DRAW)
    const stride = 28
    const aPos = gl.getAttribLocation(program, 'aPos')
    const aOther = gl.getAttribLocation(program, 'aOther')
    const aSide = gl.getAttribLocation(program, 'aSide')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(aOther)
    gl.vertexAttribPointer(aOther, 3, gl.FLOAT, false, stride, 12)
    gl.enableVertexAttribArray(aSide)
    gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, stride, 24)
    gl.drawArrays(gl.TRIANGLES, 0, count)
    const pixels = new Uint8Array(160 * 160 * 4)
    gl.readPixels(0, 0, 160, 160, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let unexpected = 0, gray = 0
    for (let i = 0; i < 160 * 160; i++) {
      const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2]
      const white = r === 255 && g === 255 && b === 255
      const ink = r === 128 && g === 128 && b === 128
      if (!white && !ink) unexpected++
      if (ink) gray++
    }
    const runs = []
    let run = 0
    for (let y = 0; y <= 160; y++) {
      const ink = y < 160 && pixels[(y * 160 + 80) * 4] === 128
      if (ink) { run++ } else { if (run > 0) runs.push({ start: y - run, len: run }); run = 0 }
    }
    let longest = null
    for (const r of runs) if (!longest || r.len > longest.len) longest = r
    let extent = null
    if (longest) {
      const row = longest.start + (longest.len >> 1)
      let minCol = -1, maxCol = -1
      for (let x = 0; x < 160; x++) {
        if (pixels[(row * 160 + x) * 4] === 128) { if (minCol < 0) minCol = x; maxCol = x }
      }
      extent = { row, minCol, maxCol }
    }
    return { error: gl.getError(), unexpected, gray, runs, extent }
  }, payload)
}

test('outline draws two gray ribbons of the configured screen-space width', async ({ page }) => {
  const result = await render(page, [0, 0, 300])
  expect(result.error).toBe(0)
  expect(result.unexpected).toBe(0)
  expect(result.gray).toBeGreaterThan(0)
  expect(result.runs.length).toBe(2)
  for (const run of result.runs) {
    expect(run.len).toBeGreaterThanOrEqual(2)
    expect(run.len).toBeLessThanOrEqual(4)
    expect(run.start).toBeGreaterThanOrEqual(34)
    expect(run.start).toBeLessThanOrEqual(124)
  }
  const { extent } = result
  expect(extent.minCol).toBeGreaterThanOrEqual(34)
  expect(extent.minCol).toBeLessThanOrEqual(44)
  expect(extent.maxCol).toBeGreaterThanOrEqual(116)
  expect(extent.maxCol).toBeLessThanOrEqual(126)
})

test('outline stays well-formed when edges cross the near plane', async ({ page }) => {
  const b = config.latticeHalf * config.spacing + config.radius + 0.1 * config.spacing
  const result = await render(page, [b, b, b])
  expect(result.error).toBe(0)
  expect(result.unexpected).toBe(0)
  expect(result.gray).toBeGreaterThan(0)
  expect(result.gray).toBeLessThan(160 * 160 * 0.5)
})

import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { mat4, vec3 } from 'gl-matrix'

const shader = name => readFileSync(new URL(`../src/renderer/shaders/${name}`, import.meta.url), 'utf8')
const sources = {
  vertex: shader('quads.vert.glsl'),
  fragment: shader('quads.frag.glsl').replace('%%COMMON%%', shader('common.frag.glsl')),
}

test('near-sphere pixels match independent ray intersections while turning', async ({ page }) => {
  const poses = [[-1.6, 0.4], [-19, -1.4], [-24, -1.2], [-56.6, -0.4],
    [-74.2, 0], [-97.2, -0.2], [-115.7, 3.2]]
  // Include the reverse turn, looking behind, and steep pitch at varied FOVs.
  for (let yaw = -180; yaw <= 180; yaw += 15) poses.push([yaw, 0])
  poses.push([0, 70], [0, -70], [90, 70], [-90, -70])
  const cases = []
  const camera = [-61.46, 127.48, -126.98]
  const center = [-61.5, 127.5, -127.5]
  function addCase(eye, sphere, yaw, pitch, aspect, fov, radius = 0.2) {
    const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180
    const target = [eye[0] + Math.cos(p) * Math.sin(y), eye[1] + Math.sin(p),
      eye[2] - Math.cos(p) * Math.cos(y)]
    const view = mat4.lookAt(mat4.create(), eye, target, [0, 1, 0])
    const proj = mat4.perspective(mat4.create(), fov * Math.PI / 180, aspect, 0.5, 600)
    cases.push({ label: `${yaw}/${pitch}, aspect=${aspect}, fov=${fov}, eye=${eye}`,
      view: Array.from(view), proj: Array.from(proj), center: sphere,
      centerView: Array.from(vec3.transformMat4(vec3.create(), sphere, view)),
      radius, aspect, tanHalf: Math.tan(fov * Math.PI / 360) })
  }
  for (const [aspect, fov] of [[1, 60], [0.5, 40], [2, 100]]) {
    for (const [yaw, pitch] of poses) addCase(camera, center, yaw, pitch, aspect, fov)
  }
  // Proxy center at/inside the near plane, and a sphere crossing the eye plane.
  for (const sphere of [[0, 0, -0.5], [0, 0, -0.3], [0.25, 0, -0.1],
    [0.25, 0, 0.05], [0, 0, 0.5], [0, 0, -601]]) {
    addCase([0, 0, 0], sphere, 0, 0, 1, 100)
  }
  const results = await page.evaluate(({ sources, cases }) => {
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
    gl.uniform1f(u('uDebugView'), 1)
    gl.uniform2f(u('uFogRange'), 120, 600)
    gl.uniform2f(u('uViewport'), canvas.width, canvas.height)
    gl.vertexAttrib3f(gl.getAttribLocation(program, 'aColor'), 1, 0, 0)
    const pixels = new Uint8Array(160 * 160 * 4)
    return cases.map(c => {
      gl.uniformMatrix4fv(u('uView'), false, c.view)
      gl.uniformMatrix4fv(u('uProj'), false, c.proj)
      gl.uniform1f(u('uTanHalf'), c.tanHalf)
      gl.uniform1f(u('uAspect'), c.aspect)
      gl.vertexAttrib3fv(gl.getAttribLocation(program, 'aCenter'), c.center)
      gl.vertexAttrib1f(gl.getAttribLocation(program, 'aRadius'), c.radius)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1)
      gl.readPixels(0, 0, 160, 160, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      let missing = 0, extra = 0, wrongNormal = 0, hits = 0
      for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
        const ray = [((x + 0.5) / 80 - 1) * c.aspect * c.tanHalf,
          ((y + 0.5) / 80 - 1) * c.tanHalf, -1]
        const length = Math.hypot(...ray)
        for (let i = 0; i < 3; i++) ray[i] /= length
        const b = -c.centerView.reduce((sum, v, i) => sum + v * ray[i], 0)
        const h = b * b - (c.centerView.reduce((sum, v) => sum + v * v, 0) - c.radius ** 2)
        // Ignore only the numerical uncertainty immediately at the silhouette.
        if (Math.abs(h) < 1e-5) continue
        const t = -b - Math.sqrt(Math.max(h, 0))
        const hit = h >= 0 && t > 0 && -c.centerView[2] <= 600
        const offset = (y * 160 + x) * 4
        const drawn = pixels[offset + 3] > 0
        if (hit) hits++
        if (hit && !drawn) missing++
        if (!hit && drawn) extra++
        if (hit && drawn) {
          const nx = Math.abs((t * ray[0] - c.centerView[0]) / c.radius)
          const ny = Math.abs((t * ray[1] - c.centerView[1]) / c.radius)
          if (Math.abs(pixels[offset + 1] / 255 - nx) > 0.015 ||
              Math.abs(pixels[offset + 2] / 255 - ny) > 0.015) wrongNormal++
        }
      }
      return { label: c.label, missing, extra, wrongNormal, hits, error: gl.getError() }
    })
  }, { sources, cases })
  expect(results.some(r => r.hits > 1000)).toBe(true)
  expect(results.some(r => r.hits === 0)).toBe(true)
  for (const result of results) {
    expect(result.missing, result.label).toBe(0)
    expect(result.extra, result.label).toBe(0)
    expect(result.wrongNormal, result.label).toBe(0)
    expect(result.error, result.label).toBe(0)
  }
})

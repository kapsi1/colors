import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mat4 } from 'gl-matrix'
import { load } from './loadTs.mjs'

const { config } = await load('../src/config.ts')
const { buildOutlineEdges, fillOutlineQuads, EDGE_COUNT, VERTS_PER_EDGE, FLOATS_PER_VERT } =
  await load('../src/renderer/outlineGeometry.ts')
const defaults = structuredClone(config)
beforeEach(() => Object.assign(config, structuredClone(defaults)))

const halfExtent = () =>
  config.latticeHalf * config.spacing + config.radius + 0.1 * config.spacing
const translationView = z => mat4.translate(mat4.create(), mat4.create(), [0, 0, z])

function fill(edges, view, near = config.near) {
  const out = new Float32Array((edges.length / 6) * VERTS_PER_EDGE * FLOATS_PER_VERT)
  const count = fillOutlineQuads(edges, view, near, out)
  return { count, out }
}

test('outline is 12 cube edges spanning the expanded bounds', () => {
  config.spacing = 2
  config.radius = 0.3
  const edges = buildOutlineEdges(config.spacing)
  assert.equal(edges.length, EDGE_COUNT * 6)
  const b = Math.fround(halfExtent())
  const corners = new Set()
  for (let e = 0; e < EDGE_COUNT; e++) {
    for (const k of [0, 3]) {
      const p = [edges[e * 6 + k], edges[e * 6 + k + 1], edges[e * 6 + k + 2]]
      for (const c of p) assert.ok(Math.abs(Math.abs(c) - b) < 1e-9, `corner on bounds: ${p}`)
      corners.add(p.join(','))
    }
    const varying = [0, 1, 2].filter(i => edges[e * 6 + i] !== edges[e * 6 + 3 + i])
    assert.deepEqual(varying.length, 1)
  }
  assert.equal(corners.size, 8)
})

test('all 12 edges are visible and expanded from outside the cube', () => {
  const { count, out } = fill(buildOutlineEdges(config.spacing), translationView(-300))
  assert.equal(count, EDGE_COUNT * VERTS_PER_EDGE)
  const b = Math.fround(halfExtent())
  for (let v = 0; v < count; v++) {
    const o = v * FLOATS_PER_VERT
    assert.ok(out[o + 6] === 1 || out[o + 6] === -1)
    for (const k of [0, 3]) {
      for (const c of [out[o + k], out[o + k + 1], out[o + k + 2]]) {
        assert.ok(Math.abs(Math.abs(c) - b) < 1e-9)
      }
    }
  }
})

test('edges fully behind the camera or near plane are culled', () => {
  const { count } = fill(buildOutlineEdges(config.spacing), translationView(300))
  assert.equal(count, 0)
})

test('edges are clipped exactly to the near plane and paired into quad vertices', () => {
  // The camera sits between the edge endpoints, so [0,0,1] is beyond the near plane.
  const edges = new Float32Array([0, 0, 1, 0, 0, -3])
  const { count, out } = fill(edges, translationView(0.75), 0.5)
  assert.equal(count, VERTS_PER_EDGE)
  assert.equal(out[2] + 0.75, -0.5)
  const expected = [
    [0, 0, -1.25, 0, 0, -3, 1],
    [0, 0, -3, 0, 0, -1.25, 1],
    [0, 0, -3, 0, 0, -1.25, -1],
    [0, 0, -1.25, 0, 0, -3, 1],
    [0, 0, -3, 0, 0, -1.25, -1],
    [0, 0, -1.25, 0, 0, -3, -1],
  ]
  for (let v = 0; v < 6; v++) {
    for (let i = 0; i < 7; i++) assert.equal(out[v * 7 + i], expected[v][i])
  }
})

test('from inside the cube, every emitted endpoint is at or beyond the near plane', () => {
  const { count, out } = fill(buildOutlineEdges(config.spacing), translationView(0))
  assert.equal(count, 8 * VERTS_PER_EDGE)
  for (let v = 0; v < count; v++) {
    const o = v * FLOATS_PER_VERT
    for (const k of [0, 3]) {
      assert.ok(out[o + k + 2] <= -config.near + 1e-9,
        `endpoint in front of the near plane: ${out[o + k + 2]}`)
    }
  }
})

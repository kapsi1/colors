import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './loadTs.mjs'

const { config } = await load('../src/config.ts')
const { modelColor, insideModel, cameraColor } = await load('../src/colorModel.ts')
const { buildOutlineEdges } = await load('../src/renderer/outlineGeometry.ts')
const { Camera } = await load('../src/camera.ts')
const close = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-6, `${actual} != ${expected}`))

test('HSL and HSV have the expected primary/secondary colors and distinct top caps', () => {
  const colors = [[1,0,0], [1,1,0], [0,1,0], [0,1,1], [0,0,1], [1,0,1]]
  for (const model of ['hsl', 'hsv']) {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3
      close(modelColor(Math.cos(a), model === 'hsl' ? 0 : 1, Math.sin(a), model), colors[i])
    }
    close(modelColor(0, 0, 0, model), [0.5, 0.5, 0.5])
    close(modelColor(1, -1, 0, model), [0, 0, 0])
  }
  close(modelColor(1, 1, 0, 'hsl'), [1, 1, 1])
  close(modelColor(1, 1, 0, 'hsv'), [1, 0, 0])
  close(modelColor(0.5, 0, 0, 'hsl'), [0.75, 0.25, 0.25])
  close(modelColor(0.5, 0, 0, 'hsv'), [0.5, 0.25, 0.25])
})

test('cylinder membership, HUD colors and LOD distance follow the active model and spacing', () => {
  const saved = { ...config }
  try {
    config.spacing = 2
    const half = config.latticeHalf * config.spacing
    for (const model of ['hsl', 'hsv']) {
      config.colorModel = model
      assert.equal(insideModel(1, 0, 1), false)
      assert.equal(insideModel(1, 0, 0), true)
      assert.equal(insideModel(0, 1.01, 0), false)
      assert.equal(cameraColor([half, 0, half]), null)
      assert.deepEqual(cameraColor([0, 0, 0]), [128, 128, 128])
      const cam = new Camera()
      cam.setPose(half, 0, half)
      assert.ok(Math.abs(cam.distanceToCube(config.spacing) - half * (Math.SQRT2 - 1)) < 1e-5)
    }
    config.colorModel = 'rgb'
    assert.deepEqual(cameraColor([half, 0, half]), [255, 128, 255])
  } finally { Object.assign(config, saved) }
})

test('cylinder outline has closed caps and vertical edges, and switches back to a cube', () => {
  try {
    for (const model of ['hsl', 'hsv']) {
      config.colorModel = model
      const edges = buildOutlineEdges(1)
      const b = config.latticeHalf + config.radius + 0.1
      assert.equal(edges.length / 6, 196)
      for (let i = 0; i < edges.length; i += 3) {
        assert.ok(Math.abs(Math.hypot(edges[i], edges[i + 2]) - b) < 1e-5)
        assert.ok(Math.abs(Math.abs(edges[i + 1]) - b) < 1e-5)
      }
    }
    config.colorModel = 'rgb'
    assert.equal(buildOutlineEdges(1).length / 6, 12)
  } finally { config.colorModel = 'rgb' }
})

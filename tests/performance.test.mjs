import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mat4 } from 'gl-matrix'
import { load } from './loadTs.mjs'

const { config } = await load('../src/config.ts')
const { LodController } = await load('../src/lod.ts')
const { visibleChunks, CHUNK_SIZE } = await load('../src/renderer/visibleChunks.ts')
const { GpuTimer } = await load('../src/renderer/gpuTimer.ts')
const defaults = structuredClone(config)
beforeEach(() => Object.assign(config, structuredClone(defaults)))

function simulate(lod, duration, frameMs, { rendered = true, workMs, distance = 0, start = 0 } = {}) {
  for (let now = start; now < start + duration; now += frameMs) {
    lod.update(now, frameMs, distance, 600, rendered, workMs)
  }
}

test('sustained missed 60 FPS reduces quality inside and outside the cube', () => {
  for (const distance of [0, 80]) {
    const lod = new LodController()
    simulate(lod, 700, 25, { distance })
    assert.ok(lod.effectiveScale(1) < 1)
    simulate(lod, 4000, 25, { distance, start: 700 })
    assert.ok(lod.k > 1)
  }
})

test('GPU pressure creates headroom even at a vsync-limited 60 FPS', () => {
  const lod = new LodController()
  simulate(lod, 1000, 1000 / 60, { workMs: 16 })
  assert.ok(lod.effectiveScale(1) < 1)
})

test('small sustained drops below 60 FPS and severe stalls both trigger adaptation', () => {
  for (const ms of [17.5, 650]) {
    const lod = new LodController()
    simulate(lod, 2500, ms)
    assert.ok(lod.effectiveScale(1) < 1)
  }
})

test('idle time and one long frame do not change quality', () => {
  const lod = new LodController()
  simulate(lod, 10000, 40, { rendered: false })
  lod.update(10001, 1000, 0, 600)
  simulate(lod, 2000, 1000 / 60, { start: 10002 })
  assert.equal(lod.k, 1)
  assert.equal(lod.effectiveScale(1), 1)
})

test('recovery requires sustained headroom and does not restore on idle', () => {
  const lod = new LodController()
  simulate(lod, 1000, 25)
  const reduced = lod.effectiveScale(1)
  simulate(lod, 10000, 16.67, { rendered: false, start: 1000 })
  assert.equal(lod.effectiveScale(1), reduced)
  simulate(lod, 3000, 16.67, { workMs: 2, start: 11000 })
  assert.equal(lod.effectiveScale(1), reduced)
  simulate(lod, 6000, 16.67, { workMs: 2, start: 14000 })
  assert.ok(lod.effectiveScale(1) > reduced)
})

test('manual detail, user scale ceiling, and minimum automatic scale are respected', () => {
  const lod = new LodController()
  lod.setManual(4)
  simulate(lod, 10000, 50)
  assert.equal(lod.k, 4)
  assert.equal(lod.effectiveScale(0.75), 0.75)
  lod.setAuto()
  config.minAutoScale = 0.75
  simulate(lod, 20000, 50)
  assert.equal(lod.effectiveScale(0.75), 0.75 * 0.75)
  assert.equal(lod.k, 16)
})

test('higher FPS targets adapt sooner; stable 60 FPS does not degrade', () => {
  const stable = new LodController()
  simulate(stable, 15000, 1000 / 60)
  assert.equal(stable.effectiveScale(1), 1)
  config.targetFps = 120
  const fast = new LodController()
  simulate(fast, 1500, 1000 / 60)
  assert.ok(fast.effectiveScale(1) < 1)
})

test('subpixel LOD has hysteresis and reports the actual drawn stride', () => {
  const lod = new LodController()
  assert.equal(lod.update(0, 16.67, 2000, 600, false), 2)
  assert.equal(lod.k, 2)
  assert.equal(lod.update(17, 16.67, 1600, 600, false), 2)
  assert.equal(lod.update(34, 16.67, 0, 600, false), 1)
})

test('culling rejects an entire cube behind the camera and reduces interior submission', () => {
  const view = mat4.create()
  const offsets = new Float32Array(4096 * 3)
  const f = { view, n: 256, k: 1, spacing: 1, tanHalf: Math.tan(Math.PI / 6), aspect: 16 / 9 }
  mat4.lookAt(view, [0, 0, 300], [0, 0, 400], [0, 1, 0])
  assert.equal(visibleChunks(f, offsets), 0)
  mat4.identity(view)
  const count = visibleChunks(f, offsets)
  assert.ok(count > 0 && count < 4096 / 3)
})

test('visible sphere centers are never removed across poses, FOVs, strides and aspect ratios', () => {
  const offsets = new Float32Array(4096 * 3)
  for (const k of config.lodValues) for (const aspect of [0.5, 1, 2]) for (const fov of [40, 100]) {
    const view = mat4.create()
    mat4.lookAt(view, [160, 30, 40], [0, 0, 0], [0, 1, 0])
    const n = config.latticeSize / k
    const tanHalf = Math.tan(fov * Math.PI / 360)
    const count = visibleChunks({ view, n, k, spacing: 1, tanHalf, aspect }, offsets)
    const retained = new Set()
    for (let i = 0; i < count; i++) retained.add(Array.from(offsets.subarray(i * 3, i * 3 + 3)).join(','))
    for (let z = 0; z < n; z += 3) for (let y = 0; y < n; y += 3) for (let x = 0; x < n; x += 3) {
      const wx = x * k + (k - 1) / 2 - config.latticeHalf
      const wy = y * k + (k - 1) / 2 - config.latticeHalf
      const wz = z * k + (k - 1) / 2 - config.latticeHalf
      const depth = -(view[2] * wx + view[6] * wy + view[10] * wz + view[14])
      const vx = view[0] * wx + view[4] * wy + view[8] * wz + view[12]
      const vy = view[1] * wx + view[5] * wy + view[9] * wz + view[13]
      if (depth < config.near || depth > config.far || Math.abs(vx) > depth * tanHalf * aspect || Math.abs(vy) > depth * tanHalf) continue
      const key = [x, y, z].map(v => Math.floor(v / CHUNK_SIZE) * CHUNK_SIZE).join(',')
      assert.ok(retained.has(key), `Visible sample missing at stride ${k}: ${key}`)
    }
  }
})

test('GPU timing never reads unfinished queries and discards disjoint or stale results', () => {
  let available = false, disjoint = false, resultReads = 0, deleted = 0, created = 0
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    createQuery: () => ({ id: created++ }),
    beginQuery() {}, endQuery() {},
    getParameter: () => disjoint,
    getQueryParameter: (_, type) => {
      if (type === 1) return available
      assert.ok(available)
      resultReads++
      return 5e6
    },
    deleteQuery: () => deleted++,
  }
  const timer = new GpuTimer(gl)
  for (let i = 0; i < 100; i++) { timer.begin(); timer.end(); timer.poll(i) }
  assert.equal(created, 4, 'outstanding queries are bounded')
  assert.equal(resultReads, 0)
  available = true
  assert.equal(timer.poll(100), 5)
  disjoint = true
  assert.equal(timer.poll(101), undefined)
  assert.equal(deleted, 4)
  disjoint = false
  for (let i = 0; i < 8; i++) { timer.begin(); timer.end() }
  assert.equal(timer.poll(200), 5)
  assert.equal(timer.poll(701), undefined)
  const unsupported = new GpuTimer({ getExtension: () => null })
  unsupported.begin()
  unsupported.end()
  assert.equal(unsupported.poll(0), undefined)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './loadTs.mjs'

const { config } = await load('../src/config.ts')
const { Camera } = await load('../src/camera.ts')
const defaults = structuredClone(config)

const d2r = d => (d * Math.PI) / 180
const angle = (a, b) => {
  const cross = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  return Math.atan2(Math.hypot(...cross), a[0] * b[0] + a[1] * b[1] + a[2] * b[2])
}
function closeVec(actual, expected, eps = 1e-6, label = '') {
  for (let i = 0; i < 3; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) < eps,
      `${label}: ${Array.from(actual)} vs ${expected}`,
    )
  }
}
function freshCam() {
  Object.assign(config, structuredClone(defaults))
  return new Camera()
}

// View direction of the previous yaw/pitch camera, for behavior parity while
// the orientation stays roll-free inside the old pitch clamp.
const oldFwd = (yaw, pitch) => {
  const cp = Math.cos(pitch)
  return [cp * Math.sin(yaw), Math.sin(pitch), -cp * Math.cos(yaw)]
}

test('pure vertical drags match the previous steering inside +/-90 degrees', () => {
  for (const [yawDeg, pitchDeg] of [[0, 0], [30, 20], [150, -40], [-170, 60]]) {
    const cam = freshCam()
    cam.setOrientation(d2r(yawDeg), d2r(pitchDeg))
    let pitch = d2r(pitchDeg)
    for (const dy of [-0.1, 0.15, -0.35, 0.2]) {
      cam.addLook(0, dy)
      pitch += dy
      closeVec(cam.fwd, oldFwd(d2r(yawDeg), pitch), 1e-6, `vertical drag from ${yawDeg}/${pitchDeg}`)
      closeVec(cam.right, [Math.cos(d2r(yawDeg)), 0, Math.sin(d2r(yawDeg))], 1e-6, 'right axis')
    }
  }
})

test('pure horizontal drags at level pitch match the previous steering', () => {
  for (const yawDeg of [0, 30, 150, -170]) {
    const cam = freshCam()
    cam.setOrientation(d2r(yawDeg), 0)
    let yaw = d2r(yawDeg)
    for (const dx of [0.05, -0.2, 0.3]) {
      cam.addLook(dx, 0)
      yaw += dx
      closeVec(cam.fwd, oldFwd(yaw, 0), 1e-6, `horizontal drag from ${yawDeg}`)
      closeVec(cam.right, [Math.cos(yaw), 0, Math.sin(yaw)], 1e-6, 'right axis')
      closeVec(cam.up, [0, 1, 0], 1e-6, 'level up')
    }
  }
})

test('a closed mouse circle returns to the original view', () => {
  const cam = freshCam()
  cam.setOrientation(0.4, 0.3)
  const f0 = [...cam.fwd]
  const up0 = [...cam.up]
  const right0 = [...cam.right]
  const yaw0 = cam.yaw
  const pitch0 = cam.pitch
  for (const [dx, dy] of [[0.25, 0], [0, 0.25], [-0.25, 0], [0, -0.25]]) {
    cam.addLook(dx, dy)
  }
  closeVec(cam.fwd, f0)
  closeVec(cam.up, up0)
  closeVec(cam.right, right0)
  assert.ok(Math.abs(cam.yaw - yaw0) < 1e-12)
  assert.ok(Math.abs(cam.pitch - pitch0) < 1e-12)
})

test('vertical dragging keeps turning smoothly past straight up', () => {
  const cam = freshCam()
  cam.setOrientation(0, 0)
  let prev = [...cam.fwd]
  let prevUp = [...cam.up]
  for (let i = 1; i <= 200; i++) {
    cam.addLook(0, d2r(1))
    assert.ok(Math.abs(angle(prev, cam.fwd) - d2r(1)) < 1e-6, `fwd step ${i}`)
    assert.ok(Math.abs(angle(prevUp, cam.up) - d2r(1)) < 1e-6, `up step ${i}`)
    assert.ok(Math.abs(cam.fwd[0] * cam.up[0] + cam.fwd[1] * cam.up[1] + cam.fwd[2] * cam.up[2]) < 1e-5)
    prev = [...cam.fwd]
    prevUp = [...cam.up]
  }
  closeVec(cam.fwd, [0, Math.sin(d2r(200)), -Math.cos(d2r(200))], 1e-4, '200 degrees up')
  assert.ok(Math.abs(cam.pitch - d2r(200)) < 1e-9, 'pitch keeps increasing past the old bound')
  assert.ok(Math.abs(cam.yaw) < 1e-9)
})

test('a full 360 degree vertical drag returns to the starting orientation', () => {
  const cam = freshCam()
  cam.setOrientation(0.6, 0.4)
  const f0 = [...cam.fwd]
  const u0 = [...cam.up]
  const r0 = [...cam.right]
  for (let i = 0; i < 360; i++) cam.addLook(0, d2r(1))
  closeVec(cam.fwd, f0, 1e-4, 'fwd')
  closeVec(cam.up, u0, 1e-4, 'up')
  closeVec(cam.right, r0, 1e-4, 'right')
})

test('horizontal dragging at straight up rotates the view basis without invalid values', () => {
  const cam = freshCam()
  cam.setOrientation(0, d2r(90))
  const up0 = [...cam.up]
  cam.addLook(d2r(30), 0)
  assert.ok(angle(up0, cam.up) > d2r(29), 'view rotates around the forward axis at the pole')
  assert.ok(Math.abs(angle(cam.fwd, cam.up) - d2r(90)) < 1e-6, 'up stays perpendicular')
})

test('yaw and pitch report the view direction', () => {
  const cam = freshCam()
  cam.setOrientation(d2r(120), d2r(-45))
  assert.ok(Math.abs(cam.yaw - d2r(120)) < 1e-6)
  assert.ok(Math.abs(cam.pitch - d2r(-45)) < 1e-6)
})

test('orientationVersion ignores zero look and tracks real orientation changes', () => {
  const cam = freshCam()
  const v0 = cam.orientationVersion
  cam.addLook(0, 0)
  assert.equal(cam.orientationVersion, v0)
  cam.addLook(0.01, 0.02)
  assert.ok(cam.orientationVersion > v0)
  const v1 = cam.orientationVersion
  cam.setPose(1, 2, 3)
  assert.equal(cam.orientationVersion, v1)
  cam.setOrientation(0, 0)
  assert.ok(cam.orientationVersion > v1)
})

const still = { forward: 0, strafe: 0, vertical: 0, boost: false, lookDX: 0, lookDY: 0 }

test('A/D movement stays on the horizontal screen axis', () => {
  for (const pitch of [0.7, 2.2, -2.4]) {
    const cam = freshCam()
    cam.setPose(0, 0, 0)
    cam.setOrientation(0.9, pitch)
    const p0 = [...cam.pos]
    cam.update(1 / 60, { ...still, strafe: 1 })
    const delta = cam.pos.map((v, i) => v - p0[i])
    assert.ok(delta[0] * cam.right[0] + delta[1] * cam.right[1] + delta[2] * cam.right[2] > 0)
    assert.ok(Math.abs(delta[0] * cam.fwd[0] + delta[1] * cam.fwd[1] + delta[2] * cam.fwd[2]) < 1e-6)
    assert.ok(Math.abs(delta[0] * cam.up[0] + delta[1] * cam.up[1] + delta[2] * cam.up[2]) < 1e-6)
  }
})

test('Space/Ctrl movement stays on the vertical screen axis', () => {
  for (const pitch of [0.7, 2.2, -2.4]) {
    const cam = freshCam()
    cam.setPose(0, 0, 0)
    cam.setOrientation(0.9, pitch)
    const p0 = [...cam.pos]
    cam.update(1 / 60, { ...still, vertical: 1 })
    const delta = cam.pos.map((v, i) => v - p0[i])
    assert.ok(delta[0] * cam.up[0] + delta[1] * cam.up[1] + delta[2] * cam.up[2] > 0)
    assert.ok(Math.abs(delta[0] * cam.fwd[0] + delta[1] * cam.fwd[1] + delta[2] * cam.fwd[2]) < 1e-6)
    assert.ok(Math.abs(delta[0] * cam.right[0] + delta[1] * cam.right[1] + delta[2] * cam.right[2]) < 1e-6)
  }
})

test('faceTowards aims the camera at a point', () => {
  const cam = freshCam()
  cam.setPose(5, 5, 5)
  cam.faceTowards(0, 0, 0)
  closeVec(cam.fwd, [-1, -1, -1].map(v => v / Math.sqrt(3)), 1e-6)
})

test('flying away from the cube stops at the visibility boundary', () => {
  const cam = freshCam()
  config.far = 200
  cam.setOrientation(Math.PI / 2, 0)
  const intent = { forward: 1, strafe: 0, vertical: 0, boost: false, lookDX: 0, lookDY: 0 }
  for (let i = 0; i < 1200; i++) cam.update(1 / 60, intent)
  const dist = () => cam.distanceToCube(config.spacing)
  // min(3.2 half-extents, 0.6 view distance) with far=200 -> 0.6 * 200
  assert.ok(Math.abs(dist() - 0.6 * config.far) < 1e-3, 'pressed against the boundary')
  const xAfterApproach = cam.pos[0]
  for (let i = 0; i < 120; i++) cam.update(1 / 60, intent)
  assert.ok(Math.abs(dist() - 0.6 * config.far) < 1e-3, 'stays on the boundary')
  assert.ok(Math.abs(cam.pos[0] - xAfterApproach) < 0.5, 'no further outward movement')
  assert.ok(Math.abs(cam.pos[0] - (config.latticeHalf + 0.6 * config.far)) < 0.5)
})

test('movement slides along the boundary', () => {
  const cam = freshCam()
  config.far = 200
  cam.setPose(config.latticeHalf * config.spacing + 200, 0, 0)
  cam.setOrientation(Math.PI, 0)
  const intent = { forward: 1, strafe: 0, vertical: 0, boost: false, lookDX: 0, lookDY: 0 }
  for (let i = 0; i < 120; i++) cam.update(1 / 60, intent)
  assert.ok(Math.abs(cam.distanceToCube(config.spacing) - 0.6 * config.far) < 1e-6)
  assert.ok(cam.pos[2] > 10, 'moved tangentially along the boundary')
})

test('shrinking the view distance pulls the camera back inside', () => {
  const cam = freshCam()
  config.far = 600
  cam.setPose(config.latticeHalf * config.spacing + 300, 0, 0)
  cam.update(1 / 60, { forward: 0, strafe: 0, vertical: 0, boost: false, lookDX: 0, lookDY: 0 })
  assert.ok(Math.abs(cam.distanceToCube(config.spacing) - 300) < 1e-9, 'inside is untouched')
  config.far = 200
  cam.update(1 / 60, { forward: 0, strafe: 0, vertical: 0, boost: false, lookDX: 0, lookDY: 0 })
  assert.ok(Math.abs(cam.distanceToCube(config.spacing) - 0.6 * config.far) < 1e-9, 'pulled in')
})

test('the boundary follows the sphere spacing', () => {
  const cam = freshCam()
  config.spacing = 2
  config.far = 1500
  cam.setPose(config.latticeHalf * config.spacing + 900, 0, 0)
  cam.update(1 / 60, { forward: 0, strafe: 0, vertical: 0, boost: false, lookDX: 0, lookDY: 0 })
  assert.ok(
    Math.abs(cam.pos[0] - config.latticeHalf * config.spacing * (1 + 3.2)) < 1e-6,
    'cube-relative boundary applies when the view distance is generous',
  )
})

test('the camera inside the cube is never clamped', () => {
  const cam = freshCam()
  config.far = 200
  cam.setPose(100, 50, 25)
  cam.update(1 / 60, { forward: 0, strafe: 0, vertical: 0, boost: false, lookDX: 0, lookDY: 0 })
  assert.equal(cam.pos[0], 100)
  assert.equal(cam.pos[1], 50)
  assert.equal(cam.pos[2], 25)
})

test('the basis stays orthonormal after long mixed turning', () => {
  const cam = freshCam()
  for (let i = 0; i < 2000; i++) {
    cam.addLook(Math.sin(i * 1.7) * 0.3, Math.cos(i * 0.9) * 0.3)
  }
  const { fwd: f, right: r, up: u } = cam
  const len = v => Math.hypot(v[0], v[1], v[2])
  for (const v of [f, r, u]) assert.ok(Math.abs(len(v) - 1) < 1e-6)
  assert.ok(Math.abs(f[0] * r[0] + f[1] * r[1] + f[2] * r[2]) < 1e-6)
  assert.ok(Math.abs(f[0] * u[0] + f[1] * u[1] + f[2] * u[2]) < 1e-6)
  assert.ok(Math.abs(r[0] * u[0] + r[1] * u[1] + r[2] * u[2]) < 1e-6)
})

test('resetPose returns to the startup pose and drops velocity', () => {
  const cam = freshCam()
  const start = [...cam.pos]
  const startFwd = [...cam.fwd]
  cam.update(1, { forward: 1, strafe: 0, vertical: 1, boost: true, lookDX: 0, lookDY: 0 })
  cam.addLook(2.5, -1.2)
  assert.ok(Math.hypot(...cam.pos.map((v, i) => v - start[i])) > 1, 'camera has moved away')
  cam.resetPose()
  closeVec(cam.pos, start, 1e-9, 'position restored')
  closeVec(cam.fwd, startFwd, 1e-9, 'orientation restored')
  closeVec(cam.vel, [0, 0, 0], 1e-9, 'velocity cleared')
})

test('intent magnitude scales the target velocity for the phone stick', () => {
  const cam = freshCam()
  cam.setOrientation(Math.PI / 2, 0)
  for (let i = 0; i < 120; i++) {
    cam.update(1 / 60, { forward: 1, strafe: 0, vertical: 0, boost: false, lookDX: 0, lookDY: 0, magnitude: 0.4 })
  }
  assert.ok(Math.abs(Math.hypot(...cam.vel) - 0.4 * config.baseSpeed) < 0.1,
    `velocity settles at 40% speed, got ${Math.hypot(...cam.vel)}`)
})

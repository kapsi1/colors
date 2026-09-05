import { mat4, quat, vec3 } from 'gl-matrix'
import { config } from './config'
import type { FrameIntent } from './input'

const FWD0: vec3 = vec3.fromValues(0, 0, -1)
const RIGHT0: vec3 = vec3.fromValues(1, 0, 0)
const UP0: vec3 = vec3.fromValues(0, 1, 0)

// The camera keeps its full orientation in a quaternion and mouse deltas turn
// it around its own right/up axes. Vertical turning therefore continues past
// the old +/-90 degree pitch bounds like horizontal turning, rolling over
// smoothly instead of stopping at a pole.
export class Camera {
  pos: vec3
  vel: vec3 = vec3.create()
  fwd: vec3 = vec3.create()
  right: vec3 = vec3.create()
  up: vec3 = vec3.create()
  readonly view: mat4 = mat4.create()
  readonly proj: mat4 = mat4.create()
  orientationVersion = 0
  private readonly orient = quat.create()
  private center: vec3 = vec3.create()

  constructor() {
    this.pos = vec3.fromValues(
      config.startPos[0],
      config.startPos[1],
      config.startPos[2],
    )
    this.setOrientation(
      (config.startYawDeg * Math.PI) / 180,
      (config.startPitchDeg * Math.PI) / 180,
    )
  }

  setPose(x: number, y: number, z: number): void {
    vec3.set(this.pos, x, y, z)
    this.updateView()
  }

  faceTowards(x: number, y: number, z: number): void {
    const dx = x - this.pos[0]
    const dy = y - this.pos[1]
    const dz = z - this.pos[2]
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-9) return
    this.setOrientation(
      Math.atan2(dx / len, -dz / len),
      Math.asin(Math.max(-1, Math.min(1, dy / len))),
    )
  }

  setOrientation(yawRad: number, pitchRad: number): void {
    quat.identity(this.orient)
    quat.rotateY(this.orient, this.orient, -yawRad)
    quat.rotateX(this.orient, this.orient, pitchRad)
    this.orientationVersion++
    this.updateBasis()
    this.updateView()
  }

  addLook(dxRad: number, dyRad: number): void {
    quat.rotateY(this.orient, this.orient, -dxRad)
    quat.rotateX(this.orient, this.orient, dyRad)
    quat.normalize(this.orient, this.orient)
    this.orientationVersion++
    this.updateBasis()
  }

  // View direction as the classic yaw/pitch pair, for URL state.
  get yaw(): number {
    return Math.atan2(this.fwd[0], -this.fwd[2])
  }

  get pitch(): number {
    return Math.asin(Math.max(-1, Math.min(1, this.fwd[1])))
  }

  update(dt: number, intent: FrameIntent): void {
    const speed = config.baseSpeed * (intent.boost ? config.boost : 1)
    let tx = this.fwd[0] * intent.forward + this.right[0] * intent.strafe
    let ty = this.fwd[1] * intent.forward + intent.vertical
    let tz = this.fwd[2] * intent.forward + this.right[2] * intent.strafe
    const len = Math.hypot(tx, ty, tz)
    if (len > 1e-6) {
      tx = (tx / len) * speed
      ty = (ty / len) * speed
      tz = (tz / len) * speed
    } else {
      tx = 0
      ty = 0
      tz = 0
    }
    const a = 1 - Math.exp(-dt / config.velTau)
    this.vel[0] += (tx - this.vel[0]) * a
    this.vel[1] += (ty - this.vel[1]) * a
    this.vel[2] += (tz - this.vel[2]) * a
    for (let i = 0; i < 3; i++) {
      if (Math.abs(this.vel[i]) < 0.005) this.vel[i] = 0
    }
    this.pos[0] += this.vel[0] * dt
    this.pos[1] += this.vel[1] * dt
    this.pos[2] += this.vel[2] * dt
    this.updateView()
  }

  updateProj(aspect: number): void {
    mat4.perspective(this.proj, (config.fovDeg * Math.PI) / 180, aspect, config.near, config.far)
  }

  distanceToCube(spacing: number): number {
    const half = config.latticeHalf * spacing
    const dx = Math.max(Math.abs(this.pos[0]) - half, 0)
    const dy = Math.max(Math.abs(this.pos[1]) - half, 0)
    const dz = Math.max(Math.abs(this.pos[2]) - half, 0)
    return Math.hypot(dx, dy, dz)
  }

  private updateBasis(): void {
    vec3.transformQuat(this.fwd, FWD0, this.orient)
    vec3.transformQuat(this.right, RIGHT0, this.orient)
    vec3.transformQuat(this.up, UP0, this.orient)
  }

  private updateView(): void {
    vec3.add(this.center, this.pos, this.fwd)
    mat4.lookAt(this.view, this.pos, this.center, this.up)
  }
}

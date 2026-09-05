import { mat4, vec3 } from 'gl-matrix'
import { config } from './config'
import type { FrameIntent } from './input'

// The boundary keeps the whole cube on screen: 3.2 half-extents let the corner
// view of the cube fit the field of view with a margin, and 60% of the view
// distance keeps it clear of the far plane and the fog.
const BOUNDARY_HALF_EXTENTS = 3.2
const BOUNDARY_VIEW_FRACTION = 0.6

export class Camera {
  pos: vec3
  yaw = 0
  pitch = 0
  vel: vec3 = vec3.create()
  fwd: vec3 = vec3.create()
  right: vec3 = vec3.create()
  up: vec3 = vec3.create()
  readonly view: mat4 = mat4.create()
  readonly proj: mat4 = mat4.create()
  orientationVersion = 0
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
    this.yaw = yawRad
    this.pitch = pitchRad
    this.orientationVersion++
    this.updateBasis()
    this.updateView()
  }

  addLook(dxRad: number, dyRad: number): void {
    if (dxRad === 0 && dyRad === 0) return
    this.yaw += dxRad
    this.pitch += dyRad
    this.orientationVersion++
    this.updateBasis()
  }

  update(dt: number, intent: FrameIntent): void {
    const speed = config.baseSpeed * (intent.boost ? config.boost : 1)
    let tx = this.fwd[0] * intent.forward + this.right[0] * intent.strafe + this.up[0] * intent.vertical
    let ty = this.fwd[1] * intent.forward + this.right[1] * intent.strafe + this.up[1] * intent.vertical
    let tz = this.fwd[2] * intent.forward + this.right[2] * intent.strafe + this.up[2] * intent.vertical
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
    this.clampToBoundary()
    this.updateView()
  }

  updateProj(aspect: number): void {
    mat4.perspective(this.proj, (config.fovDeg * Math.PI) / 180, aspect, config.near, config.far)
  }

  distanceToCube(spacing: number): number {
    const half = config.latticeHalf * spacing
    if (config.colorModel !== 'rgb') return Math.hypot(
      Math.max(Math.hypot(this.pos[0], this.pos[2]) - half, 0),
      Math.max(Math.abs(this.pos[1]) - half, 0))
    const dx = Math.max(Math.abs(this.pos[0]) - half, 0)
    const dy = Math.max(Math.abs(this.pos[1]) - half, 0)
    const dz = Math.max(Math.abs(this.pos[2]) - half, 0)
    return Math.hypot(dx, dy, dz)
  }

  private updateBasis(): void {
    const cp = Math.cos(this.pitch)
    const sp = Math.sin(this.pitch)
    const cy = Math.cos(this.yaw)
    const sy = Math.sin(this.yaw)
    vec3.set(this.fwd, cp * sy, sp, -cp * cy)
    vec3.set(this.right, cy, 0, sy)
    vec3.set(this.up, -sp * sy, cp, sp * cy)
  }

  // The camera is kept within the boundary so the cube always stays visible
  // with its outline. The position is projected back onto the boundary and the
  // outward velocity component is removed, so movement slides along it.
  private clampToBoundary(): void {
    const half = config.latticeHalf * config.spacing
    const maxDist = Math.min(BOUNDARY_HALF_EXTENTS * half, BOUNDARY_VIEW_FRACTION * config.far)
    const cx = Math.min(half, Math.max(-half, this.pos[0]))
    const cy = Math.min(half, Math.max(-half, this.pos[1]))
    const cz = Math.min(half, Math.max(-half, this.pos[2]))
    const dx = this.pos[0] - cx
    const dy = this.pos[1] - cy
    const dz = this.pos[2] - cz
    const dist = Math.hypot(dx, dy, dz)
    if (dist <= maxDist) return
    const scale = maxDist / dist
    vec3.set(this.pos, cx + dx * scale, cy + dy * scale, cz + dz * scale)
    const outward = (this.vel[0] * dx + this.vel[1] * dy + this.vel[2] * dz) / dist
    if (outward > 0) {
      vec3.set(
        this.vel,
        this.vel[0] - (dx / dist) * outward,
        this.vel[1] - (dy / dist) * outward,
        this.vel[2] - (dz / dist) * outward,
      )
    }
  }

  private updateView(): void {
    vec3.add(this.center, this.pos, this.fwd)
    mat4.lookAt(this.view, this.pos, this.center, this.up)
  }
}

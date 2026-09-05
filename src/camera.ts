import { mat4, vec3 } from 'gl-matrix'
import { config } from './config'
import type { FrameIntent } from './input'

const UP: vec3 = vec3.fromValues(0, 1, 0)

export class Camera {
  pos: vec3
  yaw = 0
  pitch = 0
  vel: vec3 = vec3.create()
  fwd: vec3 = vec3.create()
  right: vec3 = vec3.create()
  readonly view: mat4 = mat4.create()
  readonly proj: mat4 = mat4.create()
  private center: vec3 = vec3.create()

  constructor() {
    this.pos = vec3.fromValues(
      config.startPos[0],
      config.startPos[1],
      config.startPos[2],
    )
    const maxPitch = (config.maxPitchDeg * Math.PI) / 180
    this.yaw = (config.startYawDeg * Math.PI) / 180
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, (config.startPitchDeg * Math.PI) / 180))
    this.updateBasis()
    this.updateView()
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
    this.yaw = Math.atan2(dx / len, -dz / len)
    this.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)))
    this.updateBasis()
    this.updateView()
  }

  setOrientation(yawRad: number, pitchRad: number): void {
    this.yaw = yawRad
    const maxPitch = (config.maxPitchDeg * Math.PI) / 180
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, pitchRad))
    this.updateBasis()
    this.updateView()
  }

  addLook(dxRad: number, dyRad: number): void {
    this.yaw += dxRad
    const maxPitch = (config.maxPitchDeg * Math.PI) / 180
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch + dyRad))
    this.updateBasis()
  }

  update(dt: number, intent: FrameIntent, k: number): void {
    const speed = config.baseSpeed * (intent.boost ? config.boost : 1) * k
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
    const cp = Math.cos(this.pitch)
    vec3.set(this.fwd, cp * Math.sin(this.yaw), Math.sin(this.pitch), -cp * Math.cos(this.yaw))
    vec3.set(this.right, Math.cos(this.yaw), 0, Math.sin(this.yaw))
  }

  private updateView(): void {
    vec3.add(this.center, this.pos, this.fwd)
    mat4.lookAt(this.view, this.pos, this.center, UP)
  }
}

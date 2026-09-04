import { mat4, vec3 } from 'gl-matrix'
import { config } from './config'
import type { FrameIntent } from './input'

const UP: vec3 = vec3.fromValues(0, 1, 0)

export class Camera {
  pos: vec3
  yaw: number
  pitch: number
  vel: vec3 = vec3.create()
  fwd: vec3 = vec3.create()
  right: vec3 = vec3.create()
  readonly view: mat4 = mat4.create()
  readonly proj: mat4 = mat4.create()
  private center: vec3 = vec3.create()

  constructor() {
    const s = config.startOffset
    this.pos = vec3.fromValues(s[0] * config.latticeSize, s[1] * config.latticeSize, s[2] * config.latticeSize)
    const dir = vec3.sub(vec3.create(), vec3.fromValues(0, 0, 0), this.pos)
    vec3.normalize(dir, dir)
    this.yaw = Math.atan2(dir[0], -dir[2])
    this.pitch = Math.asin(Math.max(-1, Math.min(1, dir[1])))
    this.applyHashOverride()
    this.updateBasis()
    this.updateView()
  }

  private applyHashOverride(): void {
    const m = /cam=([-\d.]+),([-\d.]+),([-\d.]+)/.exec(window.location.hash)
    if (!m) return
    const v = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (v.some((n) => !Number.isFinite(n))) return
    vec3.set(this.pos, v[0], v[1], v[2])
    const dir = vec3.sub(vec3.create(), vec3.fromValues(0, 0, 0), this.pos)
    const len = vec3.length(dir)
    if (len < 1e-6) return
    vec3.normalize(dir, dir)
    this.yaw = Math.atan2(dir[0], -dir[2])
    this.pitch = Math.asin(Math.max(-1, Math.min(1, dir[1])))
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

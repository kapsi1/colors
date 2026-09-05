import { config } from '../config'
import type { vec3 } from 'gl-matrix'
import {
  blockOffset,
  latticeColor,
  sphereRadius,
  spriteClampDistance,
} from './lattice'
import { modelChunkBounds, rgbIndexModelPosition } from './modelGeometry'
import { createProgram, setShadingUniforms, Uniforms, type FrameState } from './gl'
import vertSrc from './shaders/quads.vert.glsl?raw'
import fragSrc from './shaders/quads.frag.glsl?raw'
import commonSrc from './shaders/common.frag.glsl?raw'
import colorModelSrc from './shaders/colorModel.glsl?raw'

const STRIDE_FLOATS = 7

export class SphereQuads {
  private prog: WebGLProgram
  private u: Uniforms
  private vao: WebGLVertexArrayObject
  private buf: WebGLBuffer
  private data: Float32Array
  private gl: WebGL2RenderingContext
  private buildKey = ''
  private count = 0
  private upload = false

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.prog = createProgram(gl, vertSrc.replace('%%COLOR_MODEL%%', colorModelSrc),
      fragSrc.replace('%%COMMON%%', commonSrc))
    this.u = new Uniforms(gl, this.prog)
    this.vao = gl.createVertexArray()!
    this.buf = gl.createBuffer()!
    this.data = new Float32Array(config.maxInstances * STRIDE_FLOATS)
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW)
    const aCenter = gl.getAttribLocation(this.prog, 'aCenter')
    const aColor = gl.getAttribLocation(this.prog, 'aColor')
    const aRadius = gl.getAttribLocation(this.prog, 'aRadius')
    gl.enableVertexAttribArray(aCenter)
    gl.vertexAttribPointer(aCenter, 3, gl.FLOAT, false, 28, 0)
    gl.enableVertexAttribArray(aColor)
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 28, 12)
    gl.enableVertexAttribArray(aRadius)
    gl.vertexAttribPointer(aRadius, 1, gl.FLOAT, false, 28, 24)
    gl.vertexAttribDivisor(aCenter, 1)
    gl.vertexAttribDivisor(aColor, 1)
    gl.vertexAttribDivisor(aRadius, 1)
    gl.bindVertexArray(null)
  }

  build(pos: vec3, k: number, projScale: number, maxPoint: number): number {
    const key = [pos[0], pos[1], pos[2], k, projScale, maxPoint, config.spacing,
      config.radius, config.maxInstances, config.colorModel].join(',')
    if (key === this.buildKey) return this.count
    this.buildKey = key
    this.upload = true
    const spacing = config.spacing
    const n = config.latticeSize / k
    const maxInstances = Math.min(config.maxInstances, this.data.length / STRIDE_FLOATS)
    if (maxInstances <= 0) return this.count = 0
    const nearDist = spriteClampDistance(k, projScale, maxPoint)
    const rk = sphereRadius(k)
    if (config.colorModel !== 'rgb') {
      return this.count = this.buildModel(pos, k, nearDist + rk, rk, maxInstances)
    }
    const D = (nearDist + rk) / spacing
    const D2 = D * D
    const off = blockOffset(k)
    const half = config.latticeHalf
    const camL = [pos[0] / spacing + half, pos[1] / spacing + half, pos[2] / spacing + half]
    const bMin: number[] = []
    const bMax: number[] = []
    for (let a = 0; a < 3; a++) {
      const lo = Math.max(0, Math.ceil((camL[a] - D - off) / k))
      const hi = Math.min(n - 1, Math.floor((camL[a] + D - off) / k))
      bMin.push(lo)
      bMax.push(hi)
    }
    const data = this.data
    let count = 0
    outer: for (let iz = bMin[2]; iz <= bMax[2]; iz++) {
      const cz = iz * k + off
      const dz = cz - camL[2]
      for (let iy = bMin[1]; iy <= bMax[1]; iy++) {
        const cy = iy * k + off
        const dy = cy - camL[1]
        for (let ix = bMin[0]; ix <= bMax[0]; ix++) {
          const cx = ix * k + off
          const dx = cx - camL[0]
          if (dx * dx + dy * dy + dz * dz > D2) continue
          const o = count * STRIDE_FLOATS
          data[o] = (cx - half) * spacing
          data[o + 1] = (cy - half) * spacing
          data[o + 2] = (cz - half) * spacing
          data[o + 3] = latticeColor(cx)
          data[o + 4] = latticeColor(cy)
          data[o + 5] = latticeColor(cz)
          data[o + 6] = rk
          count++
          if (count >= maxInstances) break outer
        }
      }
    }
    return this.count = count
  }

  private buildModel(
    pos: vec3,
    k: number,
    nearDistance: number,
    radius: number,
    maxInstances: number,
  ): number {
    const model = config.colorModel === 'hsl' ? 'hsl' : 'hsv'
    const n = config.latticeSize / k
    const size = Math.min(16, n)
    const off = blockOffset(k)
    const scale = config.latticeHalf * config.spacing
    const D2 = nearDistance * nearDistance
    const bounds = new Float64Array(6)
    const p = new Float64Array(3)
    const data = this.data
    let count = 0
    outer: for (let z = 0; z < n; z += size) {
      for (let y = 0; y < n; y += size) {
        for (let x = 0; x < n; x += size) {
          modelChunkBounds(model, x, y, z, k, bounds)
          let chunkD2 = 0
          for (let axis = 0; axis < 3; axis++) {
            const lo = bounds[axis] * scale
            const hi = bounds[axis + 3] * scale
            const d = pos[axis] < lo ? lo - pos[axis] : pos[axis] > hi ? pos[axis] - hi : 0
            chunkD2 += d * d
          }
          if (chunkD2 > D2) continue
          for (let iz = z; iz < Math.min(n, z + size); iz++) {
            const b = Math.min(255, Math.floor(iz * k + off + 0.5))
            for (let iy = y; iy < Math.min(n, y + size); iy++) {
              const g = Math.min(255, Math.floor(iy * k + off + 0.5))
              for (let ix = x; ix < Math.min(n, x + size); ix++) {
                const r = Math.min(255, Math.floor(ix * k + off + 0.5))
                rgbIndexModelPosition(r, g, b, model, p)
                const wx = p[0] * scale
                const wy = p[1] * scale
                const wz = p[2] * scale
                const dx = wx - pos[0], dy = wy - pos[1], dz = wz - pos[2]
                if (dx * dx + dy * dy + dz * dz > D2) continue
                const o = count * STRIDE_FLOATS
                data[o] = wx
                data[o + 1] = wy
                data[o + 2] = wz
                data[o + 3] = r / 255
                data[o + 4] = g / 255
                data[o + 5] = b / 255
                data[o + 6] = radius
                count++
                if (count >= maxInstances) break outer
              }
            }
          }
        }
      }
    }
    return count
  }

  render(f: FrameState, count: number): void {
    if (count <= 0) return
    const gl = this.gl
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    const u = this.u
    gl.uniformMatrix4fv(u.loc('uView'), false, f.view)
    gl.uniformMatrix4fv(u.loc('uProj'), false, f.proj)
    gl.uniform1i(u.loc('uColorModel'),
      config.colorModel === 'rgb' ? 0 : config.colorModel === 'hsl' ? 1 : 2)
    gl.uniform1f(u.loc('uLatticeHalf'), config.latticeHalf)
    gl.uniform1f(u.loc('uSpacing'), f.spacing)
    gl.uniform1f(u.loc('uTanHalf'), f.tanHalf)
    gl.uniform1f(u.loc('uAspect'), f.aspect)
    gl.uniform2f(u.loc('uViewport'), gl.drawingBufferWidth, gl.drawingBufferHeight)
    setShadingUniforms(gl, u, f)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    if (this.upload) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, count * STRIDE_FLOATS)
      this.upload = false
    }
    gl.depthFunc(gl.LEQUAL)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count)
    gl.depthFunc(gl.LESS)
  }
}

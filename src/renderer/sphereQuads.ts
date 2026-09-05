import { modelColor, insideModel } from '../colorModel'
import { config } from '../config'
import type { vec3 } from 'gl-matrix'
import {
  blockOffset,
  latticeColor,
  sphereRadius,
  spriteClampDistance,
} from './lattice'
import { createProgram, setShadingUniforms, Uniforms, type FrameState } from './gl'
import vertSrc from './shaders/quads.vert.glsl?raw'
import fragSrc from './shaders/quads.frag.glsl?raw'
import commonSrc from './shaders/common.frag.glsl?raw'

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
    this.prog = createProgram(gl, vertSrc, fragSrc.replace('%%COMMON%%', commonSrc))
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
          const px = (cx - half) / half, py = (cy - half) / half, pz = (cz - half) / half
          if (!insideModel(px, py, pz)) continue
          const o = count * STRIDE_FLOATS
          data[o] = (cx - half) * spacing
          data[o + 1] = (cy - half) * spacing
          data[o + 2] = (cz - half) * spacing
          data[o + 3] = latticeColor(cx)
          data[o + 4] = latticeColor(cy)
          data[o + 5] = latticeColor(cz)
          if (config.colorModel !== 'rgb') {
            const color = modelColor(px, py, pz, config.colorModel)
            data[o + 3] = color[0]
            data[o + 4] = color[1]
            data[o + 5] = color[2]
          }
          data[o + 6] = rk
          count++
          if (count >= maxInstances) break outer
        }
      }
    }
    return this.count = count
  }

  render(f: FrameState, count: number): void {
    if (count <= 0) return
    const gl = this.gl
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    const u = this.u
    gl.uniformMatrix4fv(u.loc('uView'), false, f.view)
    gl.uniformMatrix4fv(u.loc('uProj'), false, f.proj)
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

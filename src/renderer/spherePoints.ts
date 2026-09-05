import { config } from '../config'
import { blockOffset, sphereRadius } from './lattice'
import { createProgram, setShadingUniforms, Uniforms, type FrameState } from './gl'
import vertSrc from './shaders/points.vert.glsl?raw'
import fragSrc from './shaders/points.frag.glsl?raw'
import commonSrc from './shaders/common.frag.glsl?raw'
import { CHUNK_SIZE, visibleChunks } from './visibleChunks'

export class SpherePoints {
  private prog: WebGLProgram
  private u: Uniforms
  private vao: WebGLVertexArrayObject
  private chunks: WebGLBuffer
  private offsets = new Float32Array((config.latticeSize / CHUNK_SIZE) ** 3 * 3)
  submitted = 0

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = createProgram(gl, vertSrc, fragSrc.replace('%%COMMON%%', commonSrc))
    this.u = new Uniforms(gl, this.prog)
    this.vao = gl.createVertexArray()!
    this.chunks = gl.createBuffer()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.chunks)
    gl.bufferData(gl.ARRAY_BUFFER, this.offsets.byteLength, gl.DYNAMIC_DRAW)
    const offset = gl.getAttribLocation(this.prog, 'aChunkOffset')
    gl.enableVertexAttribArray(offset)
    gl.vertexAttribPointer(offset, 3, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(offset, 1)
    gl.bindVertexArray(null)
  }

  render(f: FrameState): void {
    const gl = this.gl
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    const u = this.u
    const n = Math.min(CHUNK_SIZE, Math.round(f.n))
    const count = visibleChunks(f, this.offsets)
    this.submitted = count * n * n * n
    if (!count) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.chunks)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.offsets, 0, count * 3)
    gl.uniformMatrix4fv(u.loc('uView'), false, f.view)
    gl.uniformMatrix4fv(u.loc('uProj'), false, f.proj)
    gl.uniform1f(u.loc('uK'), f.k)
    gl.uniform1f(u.loc('uHalfK'), blockOffset(f.k))
    gl.uniform1f(u.loc('uLatticeHalf'), config.latticeHalf)
    gl.uniform1f(u.loc('uLatticeMax'), config.latticeSize - 1)
    gl.uniform1f(u.loc('uSpacing'), f.spacing)
    gl.uniform1f(u.loc('uRadius'), sphereRadius(f.k))
    gl.uniform1f(u.loc('uProjScale'), f.projScale)
    gl.uniform1f(u.loc('uMaxPoint'), f.maxPoint)
    gl.uniform1f(u.loc('uShift'), Math.log2(n))
    gl.uniform1f(u.loc('uMask'), n - 1)
    gl.uniform1f(u.loc('uTanHalf'), f.tanHalf)
    gl.uniform1f(u.loc('uAspect'), f.aspect)
    setShadingUniforms(gl, u, f)
    gl.drawArraysInstanced(gl.POINTS, 0, n * n * n, count)
  }
}

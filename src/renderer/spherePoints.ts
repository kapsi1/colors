import { config } from '../config'
import { blockOffset, sphereRadius } from './lattice'
import { createProgram, setShadingUniforms, Uniforms, type FrameState } from './gl'
import vertSrc from './shaders/points.vert.glsl?raw'
import fragSrc from './shaders/points.frag.glsl?raw'
import commonSrc from './shaders/common.frag.glsl?raw'

export class SpherePoints {
  private prog: WebGLProgram
  private u: Uniforms
  private vao: WebGLVertexArrayObject

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = createProgram(gl, vertSrc, fragSrc.replace('%%COMMON%%', commonSrc))
    this.u = new Uniforms(gl, this.prog)
    this.vao = gl.createVertexArray()!
  }

  render(f: FrameState): void {
    const gl = this.gl
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    const u = this.u
    const n = Math.round(f.n)
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
    setShadingUniforms(gl, u, f)
    gl.drawArrays(gl.POINTS, 0, n * n * n)
  }
}

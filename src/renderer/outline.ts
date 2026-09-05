import { config } from '../config'
import { createProgram, Uniforms, type FrameState } from './gl'
import {
  buildOutlineEdges,
  fillOutlineQuads,
  EDGE_COUNT,
  FLOATS_PER_VERT,
  VERTS_PER_EDGE,
} from './outlineGeometry'
import vertSrc from './shaders/outline.vert.glsl?raw'
import fragSrc from './shaders/outline.frag.glsl?raw'

const OUTLINE_WIDTH_CSS = 1

export class Outline {
  private prog: WebGLProgram
  private u: Uniforms
  private vao: WebGLVertexArrayObject
  private buf: WebGLBuffer
  private verts = new Float32Array(EDGE_COUNT * VERTS_PER_EDGE * FLOATS_PER_VERT)
  private edges = buildOutlineEdges(config.spacing)
  private builtSpacing = config.spacing
  private builtRadius = config.radius

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = createProgram(gl, vertSrc, fragSrc)
    this.u = new Uniforms(gl, this.prog)
    this.vao = gl.createVertexArray()!
    this.buf = gl.createBuffer()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    const aPos = gl.getAttribLocation(this.prog, 'aPos')
    const aOther = gl.getAttribLocation(this.prog, 'aOther')
    const aSide = gl.getAttribLocation(this.prog, 'aSide')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, FLOATS_PER_VERT * 4, 0)
    gl.enableVertexAttribArray(aOther)
    gl.vertexAttribPointer(aOther, 3, gl.FLOAT, false, FLOATS_PER_VERT * 4, 12)
    gl.enableVertexAttribArray(aSide)
    gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, FLOATS_PER_VERT * 4, 24)
    gl.bindVertexArray(null)
  }

  render(f: FrameState): void {
    if (!config.axes) return
    if (config.spacing !== this.builtSpacing || config.radius !== this.builtRadius) {
      this.edges = buildOutlineEdges(config.spacing)
      this.builtSpacing = config.spacing
      this.builtRadius = config.radius
    }
    const gl = this.gl
    const canvas = gl.canvas as HTMLCanvasElement
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    const u = this.u
    gl.uniformMatrix4fv(u.loc('uView'), false, f.view)
    gl.uniformMatrix4fv(u.loc('uProj'), false, f.proj)
    gl.uniform2f(u.loc('uViewport'), canvas.width, canvas.height)
    const cssScale = canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1
    gl.uniform1f(u.loc('uWidth'), OUTLINE_WIDTH_CSS * cssScale)
    const count = fillOutlineQuads(this.edges, f.view, config.near, this.verts)
    if (count > 0) {
      gl.bufferData(gl.ARRAY_BUFFER, this.verts.subarray(0, count * FLOATS_PER_VERT), gl.DYNAMIC_DRAW)
      gl.drawArrays(gl.TRIANGLES, 0, count)
    }
  }
}

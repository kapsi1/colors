import { config } from '../config'
import { createProgram, Uniforms, type FrameState } from './gl'
import vertSrc from './shaders/axes.vert.glsl?raw'
import fragSrc from './shaders/axes.frag.glsl?raw'

const FLOATS_PER_VERT = 7
const EDGE_COLOR = [0.62, 0.62, 0.62]
const AXIS_COLOR = [0.2, 0.2, 0.2]

function cross(ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number, number] {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]
}

export class Axes {
  private prog: WebGLProgram
  private u: Uniforms
  private vao: WebGLVertexArrayObject
  private buf: WebGLBuffer
  private data = new Float32Array(0)
  private builtSpacing = -1
  private builtRadius = -1
  private edgeVerts = 0
  private lineVerts = 0
  private fanStart = 0

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = createProgram(gl, vertSrc, fragSrc)
    this.u = new Uniforms(gl, this.prog)
    this.vao = gl.createVertexArray()!
    this.buf = gl.createBuffer()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    const aPos = gl.getAttribLocation(this.prog, 'aPos')
    const aParam = gl.getAttribLocation(this.prog, 'aParam')
    const aColor = gl.getAttribLocation(this.prog, 'aColor')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0)
    gl.enableVertexAttribArray(aParam)
    gl.vertexAttribPointer(aParam, 1, gl.FLOAT, false, 28, 12)
    gl.enableVertexAttribArray(aColor)
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 28, 16)
    gl.bindVertexArray(null)
  }

  private rebuild(spacing: number, radius: number): void {
    const s = spacing
    const half = config.latticeHalf * s
    const B = half + radius + 0.1 * s
    const verts: number[] = []
    const push = (x: number, y: number, z: number, param: number, col: number[]): void => {
      verts.push(x, y, z, param, col[0], col[1], col[2])
    }
    for (let axis = 0; axis < 3; axis++) {
      const others = [0, 1, 2].filter((a) => a !== axis)
      for (const u of [-B, B]) {
        for (const v of [-B, B]) {
          const p0 = [0, 0, 0]
          const p1 = [0, 0, 0]
          p0[others[0]] = u
          p0[others[1]] = v
          p1[others[0]] = u
          p1[others[1]] = v
          p0[axis] = -B
          p1[axis] = B
          push(p0[0], p0[1], p0[2], 0, EDGE_COLOR)
          push(p1[0], p1[1], p1[2], 0, EDGE_COLOR)
        }
      }
    }
    this.edgeVerts = verts.length / FLOATS_PER_VERT
    const o = 2.2 * s
    const ext = 22 * s
    const coneLen = 10 * s
    const coneR = 3.2 * s
    const length = config.latticeSize * s + ext
    const cones: Array<{ dir: number[]; endLine: number[]; apex: number[] }> = []
    for (let axis = 0; axis < 3; axis++) {
      const dir = [0, 0, 0]
      dir[axis] = 1
      const start = [-half, -half, -half]
      for (let a = 0; a < 3; a++) {
        if (a !== axis) start[a] -= o
      }
      const endLine = [0, 0, 0]
      const apex = [0, 0, 0]
      for (let a = 0; a < 3; a++) {
        endLine[a] = start[a] + dir[a] * (length - coneLen)
        apex[a] = start[a] + dir[a] * length
      }
      push(start[0], start[1], start[2], 0, AXIS_COLOR)
      push(endLine[0], endLine[1], endLine[2], (length - coneLen) / s, AXIS_COLOR)
      cones.push({ dir, endLine, apex })
    }
    this.lineVerts = verts.length / FLOATS_PER_VERT
    this.fanStart = this.lineVerts
    for (const cone of cones) {
      const helper = cone.dir[1] === 1 ? [1, 0, 0] : [0, 1, 0]
      let uv = cross(cone.dir[0], cone.dir[1], cone.dir[2], helper[0], helper[1], helper[2])
      const ul = Math.hypot(uv[0], uv[1], uv[2])
      uv = [uv[0] / ul, uv[1] / ul, uv[2] / ul]
      const vv = cross(cone.dir[0], cone.dir[1], cone.dir[2], uv[0], uv[1], uv[2])
      push(cone.apex[0], cone.apex[1], cone.apex[2], 0, AXIS_COLOR)
      for (let i = 0; i <= 8; i++) {
        const t = (i / 8) * Math.PI * 2
        const c = Math.cos(t) * coneR
        const sn = Math.sin(t) * coneR
        push(
          cone.endLine[0] + uv[0] * c + vv[0] * sn,
          cone.endLine[1] + uv[1] * c + vv[1] * sn,
          cone.endLine[2] + uv[2] * c + vv[2] * sn,
          0,
          AXIS_COLOR,
        )
      }
    }
    this.data = new Float32Array(verts)
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.STATIC_DRAW)
  }

  render(f: FrameState): void {
    if (!config.axes) return
    if (config.spacing !== this.builtSpacing || config.radius !== this.builtRadius) {
      this.rebuild(config.spacing, config.radius)
      this.builtSpacing = config.spacing
      this.builtRadius = config.radius
    }
    const gl = this.gl
    const s = config.spacing
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    const u = this.u
    gl.uniformMatrix4fv(u.loc('uView'), false, f.view)
    gl.uniformMatrix4fv(u.loc('uProj'), false, f.proj)
    gl.uniform1f(u.loc('uDashPeriod'), 14 * s)
    gl.uniform1f(u.loc('uDashLen'), 8 * s)
    gl.uniform1f(u.loc('uDash'), 0)
    gl.drawArrays(gl.LINES, 0, this.edgeVerts)
    gl.uniform1f(u.loc('uDash'), 1)
    gl.drawArrays(gl.LINES, this.edgeVerts, this.lineVerts - this.edgeVerts)
    gl.uniform1f(u.loc('uDash'), 0)
    for (let i = 0; i < 3; i++) {
      gl.drawArrays(gl.TRIANGLE_FAN, this.fanStart + i * 10, 10)
    }
  }
}

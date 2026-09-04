import { config } from '../config'
import type { mat4 } from 'gl-matrix'

export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  return canvas.getContext('webgl2', {
    antialias: false,
    depth: true,
    alpha: false,
    powerPreference: 'high-performance',
  }) as WebGL2RenderingContext | null
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('createShader failed')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`shader compile failed: ${log ?? '(no log)'}`)
  }
  return sh
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  const prog = gl.createProgram()
  if (!prog) throw new Error('createProgram failed')
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog)
    gl.deleteProgram(prog)
    throw new Error(`program link failed: ${log ?? '(no log)'}`)
  }
  return prog
}

export class Uniforms {
  private cache = new Map<string, WebGLUniformLocation | null>()
  constructor(
    private gl: WebGL2RenderingContext,
    private prog: WebGLProgram,
  ) {}

  loc(name: string): WebGLUniformLocation | null {
    let l = this.cache.get(name)
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.prog, name)
      this.cache.set(name, l)
    }
    return l
  }
}

export function queryMaxPointSize(gl: WebGL2RenderingContext): number {
  const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
  const max = range && range.length > 1 ? range[1] : 1
  return Math.min(Math.max(max, 1), config.maxPointSizeCap)
}

export function setShadingUniforms(
  gl: WebGL2RenderingContext,
  u: Uniforms,
  f: FrameState,
): void {
  gl.uniform3f(u.loc('uBgColor'), config.bg[0], config.bg[1], config.bg[2])
  gl.uniform2f(u.loc('uFogRange'), f.fogRange[0], f.fogRange[1])
  gl.uniform1f(u.loc('uFogOn'), config.fog ? 1 : 0)
  gl.uniform1f(u.loc('uShadeOn'), config.shading ? 1 : 0)
}

export interface FrameState {
  view: mat4
  proj: mat4
  projScale: number
  maxPoint: number
  n: number
  k: number
  spacing: number
  radius: number
  fogRange: [number, number]
}

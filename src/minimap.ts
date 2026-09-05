import { vec3 } from 'gl-matrix'
import type { Camera } from './camera'
import { config } from './config'

type Point = [number, number, number]
type Face = { points: Point[]; color: string }

// A fixed orthographic view keeps the RGB axes stable while the camera turns.
const RIGHT: Point = [Math.SQRT1_2, 0, -Math.SQRT1_2]
const UP: Point = [-1 / Math.sqrt(6), 2 / Math.sqrt(6), -1 / Math.sqrt(6)]
const DEPTH: Point = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]
const dot = (a: ArrayLike<number>, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export class Minimap {
  private canvas = document.getElementById('minimap') as HTMLCanvasElement
  private ctx = this.canvas.getContext('2d')!
  private signature = ''
  private faces: Face[] = []
  private background = document.createElement('canvas')
  private backgroundKey = ''

  constructor() {
    // Small tiles interpolate the actual RGB coordinates over all six faces.
    const steps = 10
    for (let axis = 0; axis < 3; axis++) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < steps; i++) {
          for (let j = 0; j < steps; j++) {
            const points = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([u, v]) => {
              const p: Point = [0, 0, 0]
              p[axis] = side
              p[(axis + 1) % 3] = 2 * u / steps - 1
              p[(axis + 2) % 3] = 2 * v / steps - 1
              return p
            })
            const rgb = [0, 1, 2].map(a => Math.round((points.reduce((sum, p) => sum + p[a], 0) / 4 + 1) * 127.5))
            this.faces.push({ points, color: `rgba(${rgb.join(',')},0.17)` })
          }
        }
      }
    }
    this.faces.sort((a, b) =>
      a.points.reduce((sum, p) => sum + dot(p, DEPTH), 0) -
      b.points.reduce((sum, p) => sum + dot(p, DEPTH), 0))
  }

  update(cam: Camera, aspect: number): void {
    const size = this.canvas.clientWidth
    const dpr = Math.min(window.devicePixelRatio || 1, config.dprCap)
    if (!size) return
    const signature = [size, dpr, ...cam.pos, cam.yaw, cam.pitch, aspect, config.spacing, config.fovDeg, config.far].join(',')
    if (signature === this.signature) return
    this.signature = signature
    const pixels = Math.round(size * dpr)
    if (this.canvas.width !== pixels || this.canvas.height !== pixels) {
      this.canvas.width = this.canvas.height = pixels
    }
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    const half = config.latticeHalf * config.spacing
    const pos = Array.from(cam.pos, v => v / half) as Point
    const up = vec3.cross(vec3.create(), cam.right, cam.fwd)
    // Show a short section of the perspective frustum so its direction stays readable.
    const length = Math.min(config.far / half, 0.85)
    const height = length * Math.tan(config.fovDeg * Math.PI / 360)
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
      pos.map((v, a) => v + cam.fwd[a] * length + cam.right[a] * x * height * aspect + up[a] * y * height) as Point)
    const vertices: Point[] = []
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) vertices.push([x, y, z])
    const bounds = [...vertices, pos, ...corners]
    const extent = Math.max(2.1, ...bounds.map(p => Math.max(Math.abs(dot(p, RIGHT)), Math.abs(dot(p, UP)))))
    const scale = (size / 2 - 25) / extent
    const project = (p: Point): [number, number] => [size / 2 + dot(p, RIGHT) * scale, size / 2 - dot(p, UP) * scale]
    const path = (points: Point[], close = true): void => {
      ctx.beginPath()
      points.forEach((p, i) => {
        const [x, y] = project(p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      if (close) ctx.closePath()
    }

    const backgroundKey = [pixels, dpr, scale].join(',')
    if (backgroundKey !== this.backgroundKey) {
      this.backgroundKey = backgroundKey
      for (const face of this.faces) {
        path(face.points)
        ctx.fillStyle = face.color
        ctx.fill()
      }
      ctx.lineWidth = 1
      for (const p of vertices) {
        for (let axis = 0; axis < 3; axis++) {
          if (p[axis] !== -1) continue
          const end = [...p] as Point
          end[axis] = 1
          // An edge is hidden only when both adjoining faces point away.
          const behind = p[(axis + 1) % 3] < 0 && p[(axis + 2) % 3] < 0
          ctx.strokeStyle = behind ? 'rgba(125,135,150,0.25)' : 'rgba(35,45,60,0.55)'
          path([p, end], false)
          ctx.stroke()
        }
      }

      this.background.width = this.background.height = pixels
      this.background.getContext('2d')!.drawImage(this.canvas, 0, 0)
    } else {
      ctx.drawImage(this.background, 0, 0, size, size)
    }
    ctx.lineWidth = 1
    ctx.fillStyle = 'rgba(255,190,45,0.13)'
    for (let i = 0; i < 4; i++) {
      path([pos, corners[i], corners[(i + 1) % 4]])
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(130,80,0,0.75)'
    path(corners)
    ctx.stroke()
    for (const corner of corners) {
      path([pos, corner], false)
      ctx.stroke()
    }

    // The +X, +Y and +Z faces face this fixed minimap view. Outside the
    // cube, keep the projected points on the finite faces at their nearest edge.
    ctx.save()
    ctx.strokeStyle = 'rgba(35,45,60,0.7)'
    ctx.fillStyle = 'rgba(35,45,60,0.7)'
    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    ctx.setLineDash([1, 3])
    for (let axis = 0; axis < 3; axis++) {
      const foot = pos.map(v => Math.max(-1, Math.min(1, v))) as Point
      foot[axis] = 1
      path([pos, foot], false)
      ctx.stroke()
      const [x, y] = project(foot)
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    const labels: [Point, string, string][] = [
      [[1.22, -1, -1], 'R', '#b62b35'],
      [[-1, 1.22, -1], 'G', '#18763c'],
      [[-1, -1, 1.22], 'B', '#315cca'],
    ]
    for (const [p, label, color] of labels) {
      ctx.fillStyle = color
      const [x, y] = project(p)
      ctx.fillText(label, x, y + 4)
    }
    // Draw last to keep the camera visible through every cube face.
    const [x, y] = project(pos)
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#172433'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

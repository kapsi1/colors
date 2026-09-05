import { config } from '../config'
import type { mat4 } from 'gl-matrix'

export const EDGE_COUNT = 12
export const VERTS_PER_EDGE = 6
export const FLOATS_PER_VERT = 7

// Padding so the outline stays just outside the outermost spheres.
function outlineHalfExtent(spacing: number): number {
  return config.latticeHalf * spacing + config.radius + 0.1 * spacing
}

export function buildOutlineEdges(spacing: number): Float32Array {
  const b = outlineHalfExtent(spacing)
  const edges = new Float32Array(EDGE_COUNT * 6)
  let e = 0
  for (let axis = 0; axis < 3; axis++) {
    for (let u = 0; u < 2; u++) {
      for (let v = 0; v < 2; v++) {
        const su = u ? b : -b
        const sv = v ? b : -b
        const o = e * 6
        edges[o + axis] = -b
        edges[o + (axis + 1) % 3] = su
        edges[o + (axis + 2) % 3] = sv
        edges[o + 3 + axis] = b
        edges[o + 3 + (axis + 1) % 3] = su
        edges[o + 3 + (axis + 2) % 3] = sv
        e++
      }
    }
  }
  return edges
}

// Expands each edge into two screen-space triangles, first clipping against the
// view near plane so clip-space w stays strictly positive (the vertex shader
// divides by w to project the perpendicular offset).
export function fillOutlineQuads(
  edges: Float32Array,
  view: mat4,
  near: number,
  out: Float32Array,
): number {
  const m2 = view[2]
  const m6 = view[6]
  const m10 = view[10]
  const m14 = view[14]
  let n = 0
  for (let o = 0; o < edges.length; o += 6) {
    let ax = edges[o]
    let ay = edges[o + 1]
    let az = edges[o + 2]
    let bx = edges[o + 3]
    let by = edges[o + 4]
    let bz = edges[o + 5]
    const ad = m2 * ax + m6 * ay + m10 * az + m14 + near
    const bd = m2 * bx + m6 * by + m10 * bz + m14 + near
    if (ad > 0 && bd > 0) continue
    if (ad > 0) {
      const t = ad / (ad - bd)
      ax += (bx - ax) * t
      ay += (by - ay) * t
      az += (bz - az) * t
    } else if (bd > 0) {
      const t = bd / (bd - ad)
      bx += (ax - bx) * t
      by += (ay - by) * t
      bz += (az - bz) * t
    }
    n = vert(out, n, ax, ay, az, bx, by, bz, 1)
    n = vert(out, n, bx, by, bz, ax, ay, az, 1)
    n = vert(out, n, bx, by, bz, ax, ay, az, -1)
    n = vert(out, n, ax, ay, az, bx, by, bz, 1)
    n = vert(out, n, bx, by, bz, ax, ay, az, -1)
    n = vert(out, n, ax, ay, az, bx, by, bz, -1)
  }
  return n / FLOATS_PER_VERT
}

function vert(
  out: Float32Array,
  n: number,
  px: number,
  py: number,
  pz: number,
  ox: number,
  oy: number,
  oz: number,
  side: number,
): number {
  out[n] = px
  out[n + 1] = py
  out[n + 2] = pz
  out[n + 3] = ox
  out[n + 4] = oy
  out[n + 5] = oz
  out[n + 6] = side
  return n + FLOATS_PER_VERT
}

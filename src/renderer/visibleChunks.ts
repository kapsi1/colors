import { config } from '../config'
import { blockOffset, sphereRadius } from './lattice'
import type { FrameState } from './gl'

export const CHUNK_SIZE = 16

// Cull whole blocks before submitting vertices. Bounds include the spheres at
// block edges, so turning the camera cannot expose holes along the frustum.
export function visibleChunks(f: FrameState, out: Float32Array): number {
  const size = Math.min(CHUNK_SIZE, f.n)
  const step = size * f.k * f.spacing
  const halfSpan = (size - 1) * f.k * f.spacing / 2
  const radius = Math.sqrt(3) * halfSpan + sphereRadius(f.k)
  const origin = (blockOffset(f.k) - config.latticeHalf) * f.spacing + halfSpan
  const tanX = f.tanHalf * f.aspect
  const marginX = radius * Math.hypot(1, tanX)
  const marginY = radius * Math.hypot(1, f.tanHalf)
  const v = f.view
  let count = 0
  for (let z = 0; z < f.n; z += size) {
    const wz = origin + z / size * step
    for (let y = 0; y < f.n; y += size) {
      const wy = origin + y / size * step
      for (let x = 0; x < f.n; x += size) {
        const wx = origin + x / size * step
        const depth = -(v[2] * wx + v[6] * wy + v[10] * wz + v[14])
        if (depth + radius < config.near || depth - radius > config.far) continue
        const vx = v[0] * wx + v[4] * wy + v[8] * wz + v[12]
        const vy = v[1] * wx + v[5] * wy + v[9] * wz + v[13]
        if (Math.abs(vx) > depth * tanX + marginX ||
            Math.abs(vy) > depth * f.tanHalf + marginY) continue
        out[count * 3] = x
        out[count * 3 + 1] = y
        out[count * 3 + 2] = z
        count++
      }
    }
  }
  return count
}

import { config } from '../config'
import { blockOffset, CHUNK_SIZE, sphereRadius } from './lattice'
import { modelChunkBounds } from './modelGeometry'
import type { FrameState } from './gl'

export { CHUNK_SIZE }

// Cull whole blocks before submitting vertices. Bounds include the spheres at
// block edges, so turning the camera cannot expose holes along the frustum.
export function visibleChunks(f: FrameState, out: Float32Array): number {
  const size = Math.min(CHUNK_SIZE, f.n)
  const step = size * f.k * f.spacing
  const halfSpan = (size - 1) * f.k * f.spacing / 2
  const cubeRadius = Math.sqrt(3) * halfSpan + sphereRadius(f.k)
  const origin = (blockOffset(f.k) - config.latticeHalf) * f.spacing + halfSpan
  const tanX = f.tanHalf * f.aspect
  const v = f.view
  const bounds = new Float64Array(6)
  const modelScale = config.latticeHalf * f.spacing
  let count = 0
  for (let z = 0; z < f.n; z += size) {
    for (let y = 0; y < f.n; y += size) {
      for (let x = 0; x < f.n; x += size) {
        let wx: number, wy: number, wz: number, radius: number
        if (config.colorModel === 'rgb') {
          wx = origin + x / size * step
          wy = origin + y / size * step
          wz = origin + z / size * step
          radius = cubeRadius
        } else {
          modelChunkBounds(config.colorModel, x, y, z, f.k, bounds)
          wx = (bounds[0] + bounds[3]) * modelScale / 2
          wy = (bounds[1] + bounds[4]) * modelScale / 2
          wz = (bounds[2] + bounds[5]) * modelScale / 2
          radius = Math.hypot(
            (bounds[3] - bounds[0]) * modelScale / 2,
            (bounds[4] - bounds[1]) * modelScale / 2,
            (bounds[5] - bounds[2]) * modelScale / 2,
          ) + sphereRadius(f.k)
        }
        const marginX = radius * Math.hypot(1, tanX)
        const marginY = radius * Math.hypot(1, f.tanHalf)
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

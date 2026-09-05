import type { ColorModel } from '../colorModel'
import { config } from '../config'
import { CHUNK_SIZE } from './lattice'

const COMPONENTS = 511
// WebGL trig precision is implementation-dependent; keep transformed shader
// centers inside their CPU-computed culling bounds.
const MODEL_BOUND_EPSILON = 1e-4
const directionX = new Float64Array(3 * 256 * COMPONENTS)
const directionZ = new Float64Array(directionX.length)
const boundsCache = new Map<ColorModel, Float64Array>()
let directionsReady = false

function directionIndex(channel: number, delta: number, numerator: number): number {
  return (channel * 256 + delta) * COMPONENTS + numerator + 255
}

function ensureDirections(): void {
  if (directionsReady) return
  directionsReady = true
  for (let channel = 0; channel < 3; channel++) {
    for (let delta = 1; delta < 256; delta++) {
      for (let numerator = -delta; numerator <= delta; numerator++) {
        let h6 = numerator / delta + channel * 2
        if (h6 < 0) h6 += 6
        const i = directionIndex(channel, delta, numerator)
        const angle = h6 * Math.PI / 3
        directionX[i] = Math.cos(angle)
        directionZ[i] = Math.sin(angle)
      }
    }
  }
}

// Integer RGB indices are the source of truth for every model. This avoids the
// rounding gaps caused by sampling HSL/HSV positions and converting them back.
export function rgbIndexModelPosition(
  r: number,
  g: number,
  b: number,
  model: Exclude<ColorModel, 'rgb'>,
  out: Float64Array | number[],
): void {
  ensureDirections()
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let ux = 1
  let uz = 0
  if (delta > 0) {
    let channel: number
    let numerator: number
    if (max === r) {
      channel = 0
      numerator = g - b
    } else if (max === g) {
      channel = 1
      numerator = b - r
    } else {
      channel = 2
      numerator = r - g
    }
    const i = directionIndex(channel, delta, numerator)
    ux = directionX[i]
    uz = directionZ[i]
  }
  const sum = max + min
  const denom = model === 'hsl' ? 255 - Math.abs(sum - 255) : max
  const saturation = delta === 0 || denom === 0 ? 0 : delta / denom
  out[0] = saturation * ux
  out[1] = model === 'hsl' ? sum / 255 - 1 : max * 2 / 255 - 1
  out[2] = saturation * uz
}

function buildBaseBounds(model: Exclude<ColorModel, 'rgb'>): Float64Array {
  const chunks = config.latticeSize / CHUNK_SIZE
  const bounds = new Float64Array(chunks ** 3 * 6)
  const p = new Float64Array(3)
  for (let bz = 0; bz < chunks; bz++) {
    for (let by = 0; by < chunks; by++) {
      for (let bx = 0; bx < chunks; bx++) {
        let minX = Infinity, minY = Infinity, minZ = Infinity
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
        for (let b = bz * CHUNK_SIZE; b < (bz + 1) * CHUNK_SIZE; b++) {
          for (let g = by * CHUNK_SIZE; g < (by + 1) * CHUNK_SIZE; g++) {
            for (let r = bx * CHUNK_SIZE; r < (bx + 1) * CHUNK_SIZE; r++) {
              rgbIndexModelPosition(r, g, b, model, p)
              minX = Math.min(minX, p[0])
              minY = Math.min(minY, p[1])
              minZ = Math.min(minZ, p[2])
              maxX = Math.max(maxX, p[0])
              maxY = Math.max(maxY, p[1])
              maxZ = Math.max(maxZ, p[2])
            }
          }
        }
        const o = ((bz * chunks + by) * chunks + bx) * 6
        bounds[o] = minX - MODEL_BOUND_EPSILON
        bounds[o + 1] = minY - MODEL_BOUND_EPSILON
        bounds[o + 2] = minZ - MODEL_BOUND_EPSILON
        bounds[o + 3] = maxX + MODEL_BOUND_EPSILON
        bounds[o + 4] = maxY + MODEL_BOUND_EPSILON
        bounds[o + 5] = maxZ + MODEL_BOUND_EPSILON
      }
    }
  }
  return bounds
}

// A stride-k draw chunk combines k³ exact 16³ RGB bounds. Combining base
// chunks keeps culling conservative for every LOD without rebuilding caches.
export function modelChunkBounds(
  model: Exclude<ColorModel, 'rgb'>,
  x: number,
  y: number,
  z: number,
  k: number,
  out: Float64Array | number[],
): void {
  let bounds = boundsCache.get(model)
  if (!bounds) {
    bounds = buildBaseBounds(model)
    boundsCache.set(model, bounds)
  }
  const chunks = config.latticeSize / CHUNK_SIZE
  const bx0 = x * k / CHUNK_SIZE
  const by0 = y * k / CHUNK_SIZE
  const bz0 = z * k / CHUNK_SIZE
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let bz = bz0; bz < Math.min(chunks, bz0 + k); bz++) {
    for (let by = by0; by < Math.min(chunks, by0 + k); by++) {
      for (let bx = bx0; bx < Math.min(chunks, bx0 + k); bx++) {
        const o = ((bz * chunks + by) * chunks + bx) * 6
        minX = Math.min(minX, bounds[o])
        minY = Math.min(minY, bounds[o + 1])
        minZ = Math.min(minZ, bounds[o + 2])
        maxX = Math.max(maxX, bounds[o + 3])
        maxY = Math.max(maxY, bounds[o + 4])
        maxZ = Math.max(maxZ, bounds[o + 5])
      }
    }
  }
  out[0] = minX
  out[1] = minY
  out[2] = minZ
  out[3] = maxX
  out[4] = maxY
  out[5] = maxZ
}

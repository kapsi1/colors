import { config } from '../config'

export const CHUNK_SIZE = 16

export function blockOffset(k: number): number {
  return (k - 1) / 2
}

export function latticeColor(c: number): number {
  return Math.min(config.latticeSize - 1, Math.max(0, Math.floor(c + 0.5))) / (config.latticeSize - 1)
}

export function sphereRadius(k: number): number {
  return config.radius * k
}

export function spriteClampDistance(k: number, projScale: number, maxPoint: number): number {
  const rk = sphereRadius(k)
  return 1.3 * ((2 * rk * projScale) / maxPoint) + rk
}

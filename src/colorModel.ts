import { config } from './config'

export type ColorModel = 'rgb' | 'hsl' | 'hsv'
export const colorModelIndex = (): number => ['rgb', 'hsl', 'hsv'].indexOf(config.colorModel)

// Coordinates normalized to [-1, 1]; hue turns from +X toward +Z.
export function modelColor(x: number, y: number, z: number, model: ColorModel): [number, number, number] {
  if (model === 'rgb') return [(x + 1) / 2, (y + 1) / 2, (z + 1) / 2]
  const s = Math.min(1, Math.hypot(x, z))
  const t = Math.max(0, Math.min(1, (y + 1) / 2))
  const h = ((Math.atan2(z, x) / (2 * Math.PI)) % 1 + 1) % 1
  const c = model === 'hsl' ? (1 - Math.abs(2 * t - 1)) * s : t * s
  const m = model === 'hsl' ? t - c / 2 : t - c
  return [0, 4, 2].map(offset => m + c * Math.max(0, Math.min(1,
    Math.abs((h * 6 + offset) % 6 - 3) - 1))) as [number, number, number]
}

export function insideModel(x: number, y: number, z: number): boolean {
  return Math.abs(y) <= 1 && (config.colorModel === 'rgb'
    ? Math.abs(x) <= 1 && Math.abs(z) <= 1 : x * x + z * z <= 1)
}

export function cameraColor(pos: ArrayLike<number>): [number, number, number] | null {
  const p = Array.from(pos, v => v / (config.latticeHalf * config.spacing))
  if (!insideModel(p[0], p[1], p[2])) return null
  return modelColor(p[0], p[1], p[2], config.colorModel).map(v => Math.round(v * 255)) as [number, number, number]
}

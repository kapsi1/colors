import { config } from './config'

export type ColorModel = 'rgb' | 'hsl' | 'hsv'
export const colorModelIndex = (): number => ['rgb', 'hsl', 'hsv'].indexOf(config.colorModel)

// Coordinates normalized to [-1, 1]; hue turns from +X toward +Z.
export function modelColor(x: number, y: number, z: number, model: ColorModel): [number, number, number] {
  if (model === 'rgb') return [(x + 1) / 2, (y + 1) / 2, (z + 1) / 2]
  const [h, s, t] = modelParams(x, y, z)
  const c = model === 'hsl' ? (1 - Math.abs(2 * t - 1)) * s : t * s
  const m = model === 'hsl' ? t - c / 2 : t - c
  return [0, 4, 2].map(offset => m + c * Math.max(0, Math.min(1,
    Math.abs((h * 6 + offset) % 6 - 3) - 1))) as [number, number, number]
}

// Cylinder coordinates: hue in [0, 1), saturation and lightness/value in [0, 1].
export function modelParams(x: number, y: number, z: number): [number, number, number] {
  const s = Math.min(1, Math.hypot(x, z))
  const t = Math.max(0, Math.min(1, (y + 1) / 2))
  const h = ((Math.atan2(z, x) / (2 * Math.PI)) % 1 + 1) % 1
  return [h, s, t]
}

export function insideModel(x: number, y: number, z: number): boolean {
  return Math.abs(y) <= 1 && (config.colorModel === 'rgb'
    ? Math.abs(x) <= 1 && Math.abs(z) <= 1 : x * x + z * z <= 1)
}

function modelPosition(pos: ArrayLike<number>): [number, number, number] {
  return Array.from(pos, v => v / (config.latticeHalf * config.spacing)) as [number, number, number]
}

export function cameraColor(pos: ArrayLike<number>): [number, number, number] | null {
  const p = modelPosition(pos)
  if (!insideModel(p[0], p[1], p[2])) return null
  return modelColor(p[0], p[1], p[2], config.colorModel).map(v => Math.round(v * 255)) as [number, number, number]
}

// Info-box color text at the camera position in the model's own values;
// null for the RGB cube, where the HUD falls back to rgb(...).
export function cameraValueText(pos: ArrayLike<number>): string | null {
  if (config.colorModel === 'rgb') return null
  const p = modelPosition(pos)
  if (!insideModel(p[0], p[1], p[2])) return null
  const [h, s, t] = modelParams(p[0], p[1], p[2])
  return `${config.colorModel}(${Math.round(h * 360) % 360}, ${Math.round(s * 100)}%, ${Math.round(t * 100)}%)`
}

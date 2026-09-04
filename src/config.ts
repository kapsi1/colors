export interface Config {
  latticeSize: number
  latticeHalf: number
  spacing: number
  radius: number
  fovDeg: number
  near: number
  far: number
  bg: [number, number, number]
  fogStartFrac: number
  baseSpeed: number
  boost: number
  wheelFactor: number
  minSpeed: number
  maxSpeed: number
  velTau: number
  degPerPixel: number
  sensitivity: number
  maxPitchDeg: number
  dprCap: number
  renderScale: number
  maxInstances: number
  maxPointSizeCap: number
  fog: boolean
  shading: boolean
  axes: boolean
  lodValues: number[]
  emaAlpha: number
  lodEvalMs: number
  lodUpMs: number
  lodDownMs: number
  startOffset: [number, number, number]
}

export const config: Config = {
  latticeSize: 256,
  latticeHalf: 127.5,
  spacing: 1.0,
  radius: 0.4,
  fovDeg: 60,
  near: 0.05,
  far: 1200,
  bg: [0.9411765, 0.9411765, 0.9411765],
  fogStartFrac: 0.2,
  baseSpeed: 8,
  boost: 4,
  wheelFactor: 1.15,
  minSpeed: 0.1,
  maxSpeed: 200,
  velTau: 0.08,
  degPerPixel: 0.2,
  sensitivity: 1.0,
  maxPitchDeg: 89.9,
  dprCap: 2,
  renderScale: 1.0,
  maxInstances: 8192,
  maxPointSizeCap: 1024,
  fog: true,
  shading: true,
  axes: true,
  lodValues: [1, 2, 4, 8, 16],
  emaAlpha: 0.1,
  lodEvalMs: 250,
  lodUpMs: 20,
  lodDownMs: 8,
  startOffset: [-0.9, 0.35, -0.9],
}

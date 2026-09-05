import type { ColorModel } from './colorModel'

export interface Config {
  colorModel: ColorModel
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
  dprCap: number
  renderScale: number
  userRenderScale: number
  maxInstances: number
  maxPointSizeCap: number
  fog: boolean
  shading: boolean
  axes: boolean
  debugView: boolean
  lodValues: number[]
  emaAlpha: number
  lodEvalMs: number
  targetFps: number
  minAutoScale: number
  startPos: [number, number, number]
  startYawDeg: number
  startPitchDeg: number
}

export const config: Config = {
  colorModel: 'rgb',
  latticeSize: 256,
  latticeHalf: 127.5,
  spacing: 1.0,
  radius: 0.2,
  fovDeg: 60,
  // near: 0.05,
  near: 0.5,
  far: 600,
  bg: [0.9411765, 0.9411765, 0.9411765],
  fogStartFrac: 0.2,
  baseSpeed: 25,
  boost: 4,
  wheelFactor: 1.15,
  minSpeed: 0.1,
  maxSpeed: 100,
  velTau: 0.08,
  degPerPixel: 0.2,
  sensitivity: 1.0,
  dprCap: 2,
  renderScale: 1.0,
  userRenderScale: 1.0,
  maxInstances: 8192,
  maxPointSizeCap: 1024,
  fog: true,
  shading: true,
  axes: true,
  debugView: false,
  lodValues: [1, 2, 4, 8, 16],
  emaAlpha: 0.1,
  lodEvalMs: 250,
  targetFps: 60,
  minAutoScale: 0.5,
  startPos: [165.7, 159.9, 165.79],
  startYawDeg: -38.8,
  startPitchDeg: -32.8,
}

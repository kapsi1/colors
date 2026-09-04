import { config } from './config'

export class LodController {
  auto = true
  k = 1
  emaMs = 16.7
  private scaleIndex = 0
  private readonly scaleSteps = [1, 0.75, 0.5]
  private lastEval = -1e9
  private upStreak = 0
  private downStreak = 0

  effectiveScale(userScale: number): number {
    return Math.min(userScale, this.scaleSteps[this.scaleIndex])
  }

  update(nowMs: number, frameMs: number, distToCube: number, projScale: number): number {
    const maxK = config.lodValues[config.lodValues.length - 1]
    this.emaMs += (Math.min(frameMs, 100) - this.emaMs) * config.emaAlpha
    if (!this.auto) return this.k
    if (distToCube <= 2 * config.spacing) return 1
    if (nowMs - this.lastEval >= config.lodEvalMs) {
      this.lastEval = nowMs
      if (this.emaMs > config.lodUpMs) {
        this.upStreak++
        this.downStreak = 0
      } else if (this.emaMs < config.lodDownMs) {
        this.downStreak++
        this.upStreak = 0
      } else {
        this.upStreak = 0
        this.downStreak = 0
      }
      if (this.upStreak >= 2) {
        if (this.k < maxK) {
          this.k = Math.min(this.k * 2, maxK)
        } else if (this.scaleIndex < this.scaleSteps.length - 1) {
          this.scaleIndex++
        }
        this.upStreak = 0
      } else if (this.downStreak >= 2) {
        if (this.k > 1) {
          this.k = Math.max(this.k / 2, 1)
        } else if (this.scaleIndex > 0) {
          this.scaleIndex--
        }
        this.downStreak = 0
      }
    }
    let floor = 1
    if (distToCube > 2 * config.spacing) {
      const need = (4 * distToCube) / (config.spacing * projScale)
      while (floor < need && floor < maxK) floor *= 2
    }
    return Math.max(this.k, floor)
  }

  setManual(k: number): void {
    this.auto = false
    this.k = k
  }

  setAuto(): void {
    this.auto = true
  }
}

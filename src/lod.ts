import { config } from './config'

export class LodController {
  auto = true
  k = 1
  emaMs = 1000 / 60
  private performanceK = 1
  private distanceK = 1
  private scaleIndex = 0
  private readonly scaleSteps = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.33]
  private lastEval = 0
  private slowMs = 0
  private fastMs = 0
  private settlingUntil = 0

  effectiveScale(userScale: number): number {
    return userScale * Math.max(config.minAutoScale, this.scaleSteps[this.scaleIndex])
  }

  resetTiming(): void {
    this.emaMs = 1000 / config.targetFps
    this.slowMs = this.fastMs = 0
    this.lastEval = 0
    this.settlingUntil = 0
  }

  update(nowMs: number, frameMs: number, distToCube: number, projScale: number,
    rendered = true, workMs?: number): number {
    const budget = 1000 / config.targetFps
    // Idle frames and background-tab pauses say nothing about rendering cost.
    if (rendered && frameMs > 0) {
      frameMs = Math.min(frameMs, 100)
      this.emaMs += (frameMs - this.emaMs) * config.emaAlpha
      if (this.auto && nowMs >= this.settlingUntil) {
        const slow = this.emaMs > budget * 1.035 || (workMs !== undefined && workMs > budget * 0.9)
        // Halving the stride submits eight times as many spheres. Require
        // enough measured headroom for that jump, not just for more pixels.
        const recoveryMargin = this.scaleIndex > 0 ? 0.5 : 0.09
        const fast = this.emaMs < budget * 1.04 &&
          (workMs !== undefined ? workMs < budget * recoveryMargin : this.emaMs < budget * recoveryMargin)
        const pressure = frameMs > budget * 1.035 || (workMs !== undefined && workMs > budget * 0.9)
        this.slowMs = slow ? Math.max(0, this.slowMs + (pressure ? frameMs : -frameMs)) : 0
        this.fastMs = fast ? this.fastMs + frameMs : 0
        if (nowMs - this.lastEval >= config.lodEvalMs) {
          this.lastEval = nowMs
          if (this.slowMs >= 180) {
            this.reduceQuality()
            this.settlingUntil = nowMs + 400
            this.slowMs = this.fastMs = 0
          } else if (this.fastMs >= 6000) {
            // Large headroom and a long recovery delay avoid visible oscillation.
            if (this.scaleIndex > 0) this.scaleIndex--
            else if (this.performanceK > 1) this.performanceK /= 2
            this.settlingUntil = nowMs + 1500
            this.slowMs = this.fastMs = 0
          }
        }
      }
    } else {
      this.slowMs = this.fastMs = 0
    }
    if (!this.auto) return this.k

    // Subpixel spacing only; full-resolution projection avoids feedback from
    // dynamic resolution. Hysteresis prevents popping at distance boundaries.
    const pixelSpacing = config.spacing * projScale / Math.max(distToCube, config.spacing)
    const maxK = config.lodValues[config.lodValues.length - 1]
    while (this.distanceK < maxK && pixelSpacing * this.distanceK * 2 < 0.8) this.distanceK *= 2
    while (this.distanceK > 1 && pixelSpacing * this.distanceK > 1.2) this.distanceK /= 2
    this.k = Math.max(this.performanceK, this.distanceK)
    return this.k
  }

  private reduceQuality(): void {
    const maxK = config.lodValues[config.lodValues.length - 1]
    const canScale = this.scaleIndex < this.scaleSteps.length - 1 &&
      this.scaleSteps[this.scaleIndex] > config.minAutoScale
    // Try small resolution changes first, then alternate geometry and pixels.
    if (canScale && (this.scaleIndex < 2 || this.scaleIndex < Math.log2(this.performanceK) + 2)) {
      this.scaleIndex++
    } else if (this.performanceK < maxK) {
      this.performanceK *= 2
    } else if (canScale) {
      this.scaleIndex++
    }
  }

  setManual(k: number): void {
    if (!config.lodValues.includes(k)) return
    this.auto = false
    this.k = k
    this.resetTiming()
  }

  setAuto(): void {
    this.auto = true
    this.resetTiming()
  }
}

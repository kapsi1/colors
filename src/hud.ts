import { config } from './config'

export class Hud {
  private root: HTMLElement
  private fpsLine: HTMLElement
  private fpsCount: HTMLElement
  private camRgb: HTMLElement
  private swatch: HTMLElement
  private lastUpdate = -1e9

  constructor() {
    this.root = document.getElementById('hud')!
    this.fpsLine = document.getElementById('fps-line')!
    this.fpsCount = document.getElementById('fps-count')!
    this.camRgb = document.getElementById('cam-rgb')!
    this.swatch = document.getElementById('cam-swatch')!
  }

  get visible(): boolean {
    return !this.root.hidden
  }

  setVisible(v: boolean): void {
    this.root.hidden = !v
  }

  update(
    nowMs: number,
    emaMs: number,
    k: number,
    auto: boolean,
    rgb: [number, number, number] | null,
  ): void {
    if (nowMs - this.lastUpdate < 250) return
    this.lastUpdate = nowMs
    const fps = Math.round(1000 / Math.max(emaMs, 1e-6))
    this.fpsLine.textContent = `${fps} fps · ${emaMs.toFixed(1)} ms`
    const n = Math.round(config.latticeSize / k)
    this.fpsCount.textContent = `${(n * n * n).toLocaleString('en-US')} spheres · stride ${k}${auto ? ' (auto)' : ' (manual)'}`
    if (rgb) {
      this.camRgb.textContent = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
      this.swatch.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
    } else {
      this.camRgb.textContent = 'outside cube'
      this.swatch.style.background = 'transparent'
    }
  }
}

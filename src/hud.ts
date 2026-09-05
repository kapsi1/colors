import { Speedometer } from './speedometer'

export class Hud {
  private root: HTMLElement
  private hint: HTMLElement
  private help: HTMLButtonElement
  private fpsLine: HTMLElement
  private camRgb: HTMLElement
  private camHex: HTMLElement
  private swatch: HTMLElement
  private speedo = new Speedometer()
  private lastUpdate = -1e9
  private lastFpsText = ''
  private lastCamText = ''
  private lastHexText = ''

  constructor() {
    this.root = document.getElementById('hud')!
    this.hint = document.getElementById('hint')!
    this.help = document.getElementById('help') as HTMLButtonElement
    this.fpsLine = document.getElementById('info-fps')!
    this.camRgb = document.getElementById('cam-rgb')!
    this.camHex = document.getElementById('cam-hex')!
    this.swatch = document.getElementById('cam-swatch')!
    this.help.addEventListener('pointerdown', (e) => e.preventDefault())
    this.help.addEventListener('click', () => this.toggleHints())
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick', 'contextmenu']) {
      this.help.addEventListener(type, (e) => e.stopPropagation())
    }
  }

  get visible(): boolean {
    return !this.root.hidden
  }

  setVisible(v: boolean): void {
    this.root.hidden = !v
  }

  toggleHints(): void {
    this.hint.hidden = !this.hint.hidden
    this.help.setAttribute('aria-expanded', String(!this.hint.hidden))
  }

  update(
    nowMs: number,
    emaMs: number,
    speed: number,
    rgb: [number, number, number] | null,
  ): void {
    this.speedo.update(nowMs, speed)
    if (nowMs - this.lastUpdate < 250) return
    this.lastUpdate = nowMs
    // The box is sampled at 4 Hz; touch the DOM only when a value moved.
    const fpsText = `${Math.round(1000 / Math.max(emaMs, 1e-6))} fps`
    if (fpsText !== this.lastFpsText) {
      this.lastFpsText = fpsText
      this.fpsLine.textContent = fpsText
    }
    const camText = rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : 'outside cube'
    if (camText !== this.lastCamText) {
      this.lastCamText = camText
      this.camRgb.textContent = camText
      this.swatch.style.background = rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : 'transparent'
    }
    const hexText = rgb
      ? `#${rgb[0].toString(16).padStart(2, '0')}${rgb[1].toString(16).padStart(2, '0')}${rgb[2].toString(16).padStart(2, '0')}`
      : ''
    if (hexText !== this.lastHexText) {
      this.lastHexText = hexText
      this.camHex.textContent = hexText
    }
  }
}

import { config } from './config'

const WIDTH = 150
const HEIGHT = 96
const CX = WIDTH / 2
const CY = 54
const RADIUS = 42
const START = (150 * Math.PI) / 180
const SWEEP = (240 * Math.PI) / 180
const NEEDLE_TAU = 0.15

// Round a rough step up to a clean tick interval (1/2/2.5/5 × 10^n).
function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= raw) return m * pow
  }
  return 10 * pow
}

// A car-style dial for the mouse-wheel-controlled maximum move speed:
// tick ring over a 240 degree sweep, a needle that trails the setting like
// a real one, and a digital readout in the gap at the bottom of the arc.
export class Speedometer {
  private canvas = document.getElementById('speedo') as HTMLCanvasElement
  private ctx = this.canvas.getContext('2d')!
  private shown = 0
  private last = -1
  private lastSpeed = NaN

  update(now: number, speed: number): void {
    const dt = this.last < 0 ? 1 / 60 : Math.min((now - this.last) / 1000, 0.1)
    this.last = now

    const dpr = Math.min(window.devicePixelRatio || 1, config.dprCap)
    const pixels = Math.round(WIDTH * dpr)
    const resized = this.canvas.width !== pixels
    if (resized) {
      this.canvas.width = pixels
      this.canvas.height = Math.round(HEIGHT * dpr)
    }
    // Redraw only while the damped needle is still moving toward the value;
    // 0.05 u/s is far below the angle resolution of the dial.
    if (!resized && speed === this.lastSpeed && Math.abs(this.shown - speed) < 0.05) return
    this.lastSpeed = speed
    this.shown += (speed - this.shown) * (1 - Math.exp(-dt / NEEDLE_TAU))
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const max = config.maxSpeed
    const majorStep = niceStep(max / 4)
    const minors = Math.round(max / (majorStep / 5))
    const label = (v: number): string => (v % 1 ? v.toFixed(1) : String(v))
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(CX, CY, RADIUS, START, START + SWEEP)
    ctx.stroke()
    for (let i = 0; i <= minors; i++) {
      const v = (max * i) / minors
      const major = i % 5 === 0
      const angle = START + (SWEEP * i) / minors
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      ctx.beginPath()
      ctx.moveTo(CX + cos * (RADIUS - (major ? 7 : 4)), CY + sin * (RADIUS - (major ? 7 : 4)))
      ctx.lineTo(CX + cos * (RADIUS - 1), CY + sin * (RADIUS - 1))
      ctx.lineWidth = major ? 2 : 1
      ctx.strokeStyle = major ? '#333' : 'rgba(0,0,0,0.35)'
      ctx.stroke()
      if (major) {
        ctx.fillStyle = '#555'
        ctx.font = '7px system-ui, sans-serif'
        ctx.fillText(label(v), CX + cos * (RADIUS - 14), CY + sin * (RADIUS - 14))
      }
    }

    const angle = START + (SWEEP * Math.min(Math.max(this.shown, 0), max)) / max
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    ctx.beginPath()
    ctx.moveTo(CX - cos * 9, CY - sin * 9)
    ctx.lineTo(CX + cos * (RADIUS - 9), CY + sin * (RADIUS - 9))
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#c62f24'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(CX, CY, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = '#333'
    ctx.fill()

    ctx.fillStyle = '#222'
    ctx.font = 'bold 13px ui-monospace, Consolas, monospace'
    ctx.fillText(speed < 10 ? speed.toFixed(1) : String(Math.round(speed)), CX, CY + 22)
    ctx.fillStyle = '#777'
    ctx.font = '8px system-ui, sans-serif'
    ctx.fillText('u/s', CX, CY + 34)
  }
}

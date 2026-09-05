import { config } from './config'
import { speedToT, tToSpeed } from './settings'

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

function formatSpeed(speed: number): string {
  return speed < 10 ? speed.toFixed(1) : String(Math.round(speed))
}

// Phone-mode speed control: a vertical slider on the left screen edge with the
// current speed displayed above the track. Track position maps logarithmically
// to the move speed, exactly like the settings panel's speed row, so both
// controls agree on where a given speed sits.
export class SpeedSlider {
  private root = document.getElementById('speed-slider') as HTMLElement
  private track = document.getElementById('speed-track') as HTMLElement
  private fill = document.getElementById('speed-fill') as HTMLElement
  private thumb = document.getElementById('speed-thumb') as HTMLElement
  private value = document.getElementById('speed-value') as HTMLElement
  private dragging = false
  private lastT = -1
  private lastText = ''

  constructor() {
    this.root.tabIndex = 0
    this.track.addEventListener('pointerdown', (e) => {
      this.dragging = true
      try {
        this.track.setPointerCapture(e.pointerId)
      } catch {
        // The pointer may already be gone; the speed still updates below.
      }
      this.apply(e)
    })
    this.track.addEventListener('pointermove', (e) => {
      if (this.dragging) this.apply(e)
    })
    const end = (e: PointerEvent): void => {
      this.dragging = false
      if (this.track.hasPointerCapture(e.pointerId)) this.track.releasePointerCapture(e.pointerId)
    }
    this.track.addEventListener('pointerup', end)
    this.track.addEventListener('pointercancel', end)
    this.root.addEventListener('keydown', (e) => {
      let dir = 0
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') dir = 1
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') dir = -1
      else return
      e.preventDefault()
      const step = e.shiftKey ? 0.1 : 0.02
      config.baseSpeed = tToSpeed(clamp01(speedToT(config.baseSpeed) + dir * step))
      this.refresh()
    })
    this.refresh()
  }

  private apply(e: PointerEvent): void {
    const rect = this.track.getBoundingClientRect()
    const t = clamp01(1 - (e.clientY - rect.top) / rect.height)
    config.baseSpeed = tToSpeed(t)
    this.refresh()
  }

  // Called from the render loop; the DOM is touched only when a value moved.
  refresh(): void {
    const t = speedToT(config.baseSpeed)
    if (t !== this.lastT) {
      this.lastT = t
      const pct = `${(t * 100).toFixed(2)}%`
      this.fill.style.height = pct
      // The fill grows from the bottom; the thumb rides on its top edge.
      this.thumb.style.top = `${((1 - t) * 100).toFixed(2)}%`
      this.root.setAttribute('aria-valuenow', String(Math.round(t * 100)))
      this.root.setAttribute('aria-valuetext', `${formatSpeed(config.baseSpeed)} u/s`)
    }
    const text = formatSpeed(config.baseSpeed)
    if (text !== this.lastText) {
      this.lastText = text
      this.value.textContent = text
    }
  }
}

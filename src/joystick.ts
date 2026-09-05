// Floating thumbstick for phone mode: it spawns where the thumb lands on the
// left half of the canvas, the knob's deflection drives analog
// forward/backward/strafe movement, and it vanishes on release. The widget is
// inert (pointer-events none); input.ts routes pointer events into it.

export const JOYSTICK_RADIUS = 56
const DEAD_ZONE = 0.15
const MARGIN = 8

export interface StickValue {
  forward: number
  strafe: number
  magnitude: number
}

export class Joystick {
  private root = document.getElementById('joystick') as HTMLElement
  private knob = document.getElementById('joystick-knob') as HTMLElement
  private centerX = 0
  private centerY = 0
  private biasX = 0
  private biasY = 0
  private value: StickValue = { forward: 0, strafe: 0, magnitude: 0 }

  begin(x: number, y: number): void {
    // Clamp the ring on screen, but remember the offset between the visual
    // center and the actual touch so deflection starts at zero.
    this.centerX = Math.min(Math.max(x, JOYSTICK_RADIUS + MARGIN), window.innerWidth - JOYSTICK_RADIUS - MARGIN)
    this.centerY = Math.min(Math.max(y, JOYSTICK_RADIUS + MARGIN), window.innerHeight - JOYSTICK_RADIUS - MARGIN)
    this.biasX = x - this.centerX
    this.biasY = y - this.centerY
    this.root.style.left = `${this.centerX - JOYSTICK_RADIUS}px`
    this.root.style.top = `${this.centerY - JOYSTICK_RADIUS}px`
    this.knob.style.transform = 'translate(-50%, -50%)'
    this.root.hidden = false
    this.value = { forward: 0, strafe: 0, magnitude: 0 }
  }

  move(x: number, y: number): void {
    const dx = x - this.biasX - this.centerX
    const dy = y - this.biasY - this.centerY
    const dist = Math.hypot(dx, dy)
    const clamp = dist > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / dist : 1
    this.knob.style.transform =
      `translate(calc(-50% + ${(dx * clamp).toFixed(1)}px), calc(-50% + ${(dy * clamp).toFixed(1)}px))`
    const raw = Math.min(dist, JOYSTICK_RADIUS) / JOYSTICK_RADIUS
    const magnitude = raw <= DEAD_ZONE ? 0 : (raw - DEAD_ZONE) / (1 - DEAD_ZONE)
    this.value = dist < 1e-6 || magnitude === 0
      ? { forward: 0, strafe: 0, magnitude: 0 }
      // `|| 0` folds the -0 that a zero dy/dx produces into plain 0.
      : { forward: -dy / dist || 0, strafe: dx / dist || 0, magnitude }
  }

  end(): void {
    this.root.hidden = true
    this.value = { forward: 0, strafe: 0, magnitude: 0 }
  }

  stick(): StickValue {
    return this.value
  }
}

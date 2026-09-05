import { config } from './config'
import { Joystick } from './joystick'

export interface InputHooks {
  togglePanel(): void
  closePanel(): void
  toggleHud(): void
  setLodManual(k: number): void
  setLodAuto(): void
  toggleFullscreen(): void
}

export interface FrameIntent {
  forward: number
  strafe: number
  vertical: number
  boost: boolean
  lookDX: number
  lookDY: number
  // Rate-control scale for the movement vector; 1 for keyboard input.
  magnitude?: number
}

const MOVE_CODES = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'KeyC',
  'Space',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
])

export function initInput(canvas: HTMLCanvasElement, hooks: InputHooks): { consume(): FrameIntent } {
  const held = new Set<string>()
  const joy = new Joystick()
  let joyId: number | null = null
  let dragging = false
  let mouseDragging = false
  let activePointerId: number | null = null
  let lastX = 0
  let lastY = 0
  let lookDX = 0
  let lookDY = 0

  const isPanelControl = (): boolean => {
    const el = document.activeElement
    return (
      el instanceof HTMLElement &&
      (el.tagName === 'INPUT' ||
        el.tagName === 'SELECT' ||
        el.tagName === 'BUTTON' ||
        el.tagName === 'TEXTAREA')
    )
  }

  window.addEventListener('keydown', (e) => {
    const code = e.code
    if (code === 'Tab') {
      e.preventDefault()
      if (!e.repeat) hooks.togglePanel()
      return
    }
    if (code === 'Escape') {
      hooks.closePanel()
      return
    }
    if (isPanelControl()) return
    if (code === 'KeyF') {
      e.preventDefault()
      if (!e.repeat) hooks.toggleFullscreen()
      return
    }
    if (code === 'KeyH') {
      e.preventDefault()
      if (!e.repeat) hooks.toggleHud()
      return
    }
    if (code.startsWith('Digit')) {
      e.preventDefault()
      if (e.repeat) return
      const d = Number(code.slice(5))
      if (d === 0) hooks.setLodAuto()
      else if (d >= 1 && d <= 5) hooks.setLodManual(config.lodValues[d - 1])
      return
    }
    if (MOVE_CODES.has(code)) {
      e.preventDefault()
      held.add(code)
    }
  })

  window.addEventListener('keyup', (e) => {
    held.delete(e.code)
  })

  // Phone mode: a touch on the left half of the canvas spawns the floating
  // joystick; every other touch (and the mouse) steers the view. Ending the
  // joystick's pointer only retires the stick, an active look drag keeps going.
  const endDrag = (e?: PointerEvent): void => {
    if (e && e.pointerId === joyId) {
      joyId = null
      joy.end()
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      return
    }
    if (e && activePointerId !== null && e.pointerId !== activePointerId) return
    dragging = false
    mouseDragging = false
    canvas.classList.remove('grabbing')
    if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
      canvas.releasePointerCapture(activePointerId)
    }
    activePointerId = null
    if (document.pointerLockElement === canvas) document.exitPointerLock()
  }

  window.addEventListener('blur', () => {
    held.clear()
    joyId = null
    joy.end()
    endDrag()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return
    held.clear()
    joyId = null
    joy.end()
    lookDX = lookDY = 0
    endDrag()
  })

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const ae = document.activeElement
    if (ae instanceof HTMLElement && ae !== document.body) ae.blur()
    if (
      config.phoneMode &&
      e.pointerType !== 'mouse' &&
      joyId === null &&
      e.clientX < canvas.clientWidth / 2
    ) {
      joyId = e.pointerId
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // Pointer capture is best-effort; pointermove deltas still drive the stick.
      }
      joy.begin(e.clientX, e.clientY)
      return
    }
    dragging = true
    mouseDragging = e.pointerType === 'mouse'
    activePointerId = e.pointerId
    lastX = e.clientX
    lastY = e.clientY
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {
      // Pointer capture is best-effort; pointermove deltas still steer.
    }
    canvas.classList.add('grabbing')
    if (mouseDragging) {
      try {
        void canvas.requestPointerLock().catch(() => {})
      } catch {
        // Pointer capture remains as the fallback when pointer lock is unavailable.
      }
    }
  })

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === joyId) {
      joy.move(e.clientX, e.clientY)
      return
    }
    if (!dragging || document.pointerLockElement === canvas) return
    const mdx = e.clientX - lastX
    const mdy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    const rad = (config.degPerPixel * config.sensitivity * Math.PI) / 180
    lookDX += mdx * rad
    lookDY -= mdy * rad
  })
  document.addEventListener('mousemove', (e) => {
    if (!dragging || document.pointerLockElement !== canvas) return
    const rad = (config.degPerPixel * config.sensitivity * Math.PI) / 180
    lookDX += e.movementX * rad
    lookDY -= e.movementY * rad
  })

  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  document.addEventListener('pointerlockchange', () => {
    if (mouseDragging && document.pointerLockElement !== canvas) endDrag()
  })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      if (e.deltaY === 0) return
      const dir = e.deltaY < 0 ? 1 : -1
      const steps = Math.max(1, Math.min(10, Math.round(Math.abs(e.deltaY) / 100)))
      config.baseSpeed = Math.min(
        config.maxSpeed,
        Math.max(config.minSpeed, config.baseSpeed * Math.pow(config.wheelFactor, dir * steps)),
      )
    },
    { passive: false },
  )

  return {
    consume(): FrameIntent {
      const kForward = (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0)
      const kStrafe = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0)
      const down = held.has('ControlLeft') || held.has('ControlRight') || held.has('KeyC')
      const kVertical = (held.has('Space') ? 1 : 0) - (down ? 1 : 0)
      // Keyboard wins over the stick; the stick alone moves at its deflection.
      const useKeys = kForward !== 0 || kStrafe !== 0 || kVertical !== 0
      const stick = joy.stick()
      const intent: FrameIntent = {
        forward: useKeys ? kForward : stick.forward,
        strafe: useKeys ? kStrafe : stick.strafe,
        vertical: kVertical,
        boost: held.has('ShiftLeft') || held.has('ShiftRight'),
        lookDX,
        lookDY,
        magnitude: useKeys ? 1 : stick.magnitude,
      }
      lookDX = 0
      lookDY = 0
      return intent
    },
  }
}

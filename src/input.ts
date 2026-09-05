import { config } from './config'

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
  const touches = new Set<number>()
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

  // Phone mode: a touch held anywhere on the canvas drives the camera forward
  // while the same finger's drag steers the view, so one gesture moves and
  // looks at once. The speed slider is a separate element and does not count.
  const endDrag = (e?: PointerEvent): void => {
    if (e && e.pointerType !== 'mouse') touches.delete(e.pointerId)
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
    touches.clear()
    endDrag()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return
    held.clear()
    touches.clear()
    lookDX = lookDY = 0
    endDrag()
  })

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const ae = document.activeElement
    if (ae instanceof HTMLElement && ae !== document.body) ae.blur()
    dragging = true
    mouseDragging = e.pointerType === 'mouse'
    if (!mouseDragging) touches.add(e.pointerId)
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
      const forward = (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0)
      const strafe = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0)
      const down = held.has('ControlLeft') || held.has('ControlRight') || held.has('KeyC')
      const intent: FrameIntent = {
        forward: Math.max(forward, config.phoneMode && touches.size > 0 ? 1 : 0),
        strafe,
        vertical: (held.has('Space') ? 1 : 0) - (down ? 1 : 0),
        boost: held.has('ShiftLeft') || held.has('ShiftRight'),
        lookDX,
        lookDY,
      }
      lookDX = 0
      lookDY = 0
      return intent
    },
  }
}

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
  let dragging = false
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

  window.addEventListener('blur', () => {
    held.clear()
    dragging = false
    canvas.classList.remove('grabbing')
  })

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const ae = document.activeElement
    if (ae instanceof HTMLElement && ae !== document.body) ae.blur()
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    canvas.setPointerCapture(e.pointerId)
    canvas.classList.add('grabbing')
  })

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const mdx = typeof e.movementX === 'number' ? e.movementX : e.clientX - lastX
    const mdy = typeof e.movementY === 'number' ? e.movementY : e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    const rad = (config.degPerPixel * config.sensitivity * Math.PI) / 180
    lookDX += mdx * rad
    lookDY -= mdy * rad
  })

  const endDrag = (): void => {
    dragging = false
    canvas.classList.remove('grabbing')
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
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
        forward,
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

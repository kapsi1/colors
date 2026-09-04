import { config, type Config } from './config'
import { Camera } from './camera'
import { initInput } from './input'
import { LodController } from './lod'
import { Hud } from './hud'
import { SettingsPanel } from './settings'
import { createGL, queryMaxPointSize, type FrameState } from './renderer/gl'
import { SpherePoints } from './renderer/spherePoints'
import { SphereQuads } from './renderer/sphereQuads'
import { Axes } from './renderer/axes'

interface Renderer {
  points: SpherePoints
  quads: SphereQuads
  axes: Axes
}

function createRenderer(gl: WebGL2RenderingContext): Renderer {
  return {
    points: new SpherePoints(gl),
    quads: new SphereQuads(gl),
    axes: new Axes(gl),
  }
}

async function toggleFullscreen(): Promise<void> {
  const kb = navigator as Navigator & {
    keyboard?: { lock?(codes: string[]): Promise<void>; unlock?(): void }
  }
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      await kb.keyboard?.lock?.(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ControlLeft', 'ControlRight'])
    } else {
      kb.keyboard?.unlock?.()
      await document.exitFullscreen()
    }
  } catch {
    return
  }
}

declare global {
  interface Window {
    __cube?: { cam: Camera; lod: LodController; config: Config }
  }
}

function main(): void {
  const canvas = document.getElementById('view') as HTMLCanvasElement
  const fallback = document.getElementById('fallback')!
  const gl0 = createGL(canvas)
  if (!gl0) {
    fallback.hidden = false
    return
  }
  const gl: WebGL2RenderingContext = gl0

  const cam = new Camera()
  const lod = new LodController()
  window.__cube = { cam, lod, config }
  const hud = new Hud()
  const settings = new SettingsPanel({
    getLod: () => ({ auto: lod.auto, k: lod.k }),
    setLodManual: (k) => lod.setManual(k),
    setLodAuto: () => lod.setAuto(),
  })
  const input = initInput(canvas, {
    togglePanel: () => settings.toggle(),
    closePanel: () => settings.close(),
    toggleHud: () => hud.setVisible(!hud.visible),
    setLodManual: (k) => lod.setManual(k),
    setLodAuto: () => lod.setAuto(),
    toggleFullscreen: () => void toggleFullscreen(),
  })

  let renderer = createRenderer(gl)
  let maxPoint = queryMaxPointSize(gl)
  let lost = false
  let raf = 0
  let last = -1

  if (window.location.hash.includes('panel=1')) settings.show()

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    lost = true
    cancelAnimationFrame(raf)
    fallback.textContent = 'WebGL context lost — waiting for restore…'
    fallback.hidden = false
  })
  canvas.addEventListener('webglcontextrestored', () => {
    renderer = createRenderer(gl)
    maxPoint = queryMaxPointSize(gl)
    lost = false
    fallback.hidden = true
    fallback.textContent =
      'WebGL2 is required to render the RGB color cube. Please use a current version of Chrome, Edge, Firefox, or Safari.'
    last = -1
    raf = requestAnimationFrame(frame)
  })

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, config.dprCap)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr * config.renderScale))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr * config.renderScale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
  }

  function cameraRgb(): [number, number, number] | null {
    const out: [number, number, number] = [0, 0, 0]
    for (let a = 0; a < 3; a++) {
      const g = Math.round(cam.pos[a] / config.spacing + config.latticeHalf)
      if (g < 0 || g > config.latticeSize - 1) return null
      out[a] = g
    }
    return out
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    const frameMs = last < 0 ? 16.7 : now - last
    last = now
    if (lost) return
    const dt = Math.min(frameMs, 100) / 1000
    resize()
    gl.viewport(0, 0, canvas.width, canvas.height)

    const intent = input.consume()
    cam.addLook(intent.lookDX, intent.lookDY)

    const projScale = (0.5 * canvas.height) / Math.tan((config.fovDeg * Math.PI) / 360)
    const k = lod.update(now, frameMs, cam.distanceToCube(config.spacing), projScale)
    cam.update(dt, intent, k)
    cam.updateProj(canvas.width / canvas.height)

    gl.clearColor(config.bg[0], config.bg[1], config.bg[2], 1)
    gl.enable(gl.DEPTH_TEST)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    const state: FrameState = {
      view: cam.view,
      proj: cam.proj,
      projScale,
      maxPoint,
      n: config.latticeSize / k,
      k,
      spacing: config.spacing,
      radius: config.radius,
      fogRange: [config.far * config.fogStartFrac, config.far],
    }
    renderer.points.render(state)
    const quadCount = renderer.quads.build(cam.pos, k, projScale, maxPoint)
    renderer.quads.render(state, quadCount)
    renderer.axes.render(state)

    hud.update(now, lod.emaMs, k, lod.auto, cameraRgb())
    settings.sync()
  }

  raf = requestAnimationFrame(frame)
}

main()

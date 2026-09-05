import { config, type Config } from './config'
import { Camera } from './camera'
import { initInput } from './input'
import { LodController } from './lod'
import { Hud } from './hud'
import { Minimap } from './minimap'
import { SettingsPanel, rgbToHex, hexToRgb } from './settings'
import { createGL, queryMaxPointSize, type FrameState } from './renderer/gl'
import { SpherePoints } from './renderer/spherePoints'
import { SphereQuads } from './renderer/sphereQuads'
import { Axes } from './renderer/axes'
import { GpuTimer } from './renderer/gpuTimer'

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
    __cube?: {
      cam: Camera
      lod: LodController
      config: Config
      gl: WebGL2RenderingContext
      renders: number
      submitted: number
    }
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

  const initial = {
    fovDeg: config.fovDeg,
    spacing: config.spacing,
    radius: config.radius,
    far: config.far,
    baseSpeed: config.baseSpeed,
    sensitivity: config.sensitivity,
    userRenderScale: config.userRenderScale,
    targetFps: config.targetFps,
    minAutoScale: config.minAutoScale,
    bgHex: rgbToHex(config.bg),
    fog: config.fog,
    shading: config.shading,
    axes: config.axes,
  }

  const cam = new Camera()
  const lod = new LodController()

  const params = new URLSearchParams(window.location.hash.slice(1))
  const numParam = (key: string, min: number, max: number): number | null => {
    const raw = params.get(key)
    if (raw === null) return null
    const v = Number(raw)
    if (!Number.isFinite(v)) return null
    return Math.min(max, Math.max(min, v))
  }
  const flagParam = (key: string): boolean | null => {
    const v = params.get(key)
    if (v === '1') return true
    if (v === '0') return false
    return null
  }
  const deg2rad = (deg: number): number => (deg * Math.PI) / 180

  const fov = numParam('fov', 40, 100)
  if (fov !== null) config.fovDeg = fov
  const spacing = numParam('sp', 0.5, 2)
  if (spacing !== null) config.spacing = spacing
  const radius = numParam('r', 0.02, (config.spacing - 0.02) / 2)
  if (radius !== null) config.radius = radius
  const far = numParam('far', 100, 1500)
  if (far !== null) config.far = far
  const speed = numParam('speed', config.minSpeed, config.maxSpeed)
  if (speed !== null) config.baseSpeed = speed
  const sens = numParam('sens', 0.1, 3)
  if (sens !== null) config.sensitivity = sens
  const scale = numParam('scale', 0.5, 1)
  if (scale === 0.5 || scale === 0.75 || scale === 1) config.userRenderScale = scale
  const fps = numParam('fps', 60, 144)
  if (fps !== null) config.targetFps = Math.round(fps)
  const minScale = numParam('minscale', 0.33, 1)
  if (minScale !== null && [0.33, 0.5, 0.75, 1].includes(minScale)) config.minAutoScale = minScale
  const fog = flagParam('fog')
  if (fog !== null) config.fog = fog
  const shade = flagParam('shade')
  if (shade !== null) config.shading = shade
  const axes = flagParam('axes')
  if (axes !== null) config.axes = axes
  if (params.get('debug') === '1') config.debugView = true
  const bgHex = params.get('bg')
  if (bgHex !== null && /^#[0-9a-fA-F]{6}$/.test(bgHex)) config.bg = hexToRgb(bgHex)

  const camParam = params.get('cam')
  if (camParam !== null) {
    const m = /^([-\d.eE]+),([-\d.eE]+),([-\d.eE]+)$/.exec(camParam.trim())
    if (m) {
      const [x, y, z] = [Number(m[1]), Number(m[2]), Number(m[3])]
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) cam.setPose(x, y, z)
    }
    cam.faceTowards(0, 0, 0)
  }
  const yaw = numParam('yaw', -3600, 3600)
  const pitch = numParam('pitch', -89.9, 89.9)
  if (yaw !== null || pitch !== null) {
    cam.setOrientation(
      yaw !== null ? deg2rad(yaw) : cam.yaw,
      pitch !== null ? deg2rad(pitch) : cam.pitch,
    )
  }

  let quadsDisabled = false
  if (params.get('quads') === '0') {
    config.maxInstances = 0
    quadsDisabled = true
  }
  const kParam = numParam('k', 1, 16)
  if (kParam !== null && (kParam & (kParam - 1)) === 0) lod.setManual(kParam)
  const auto = flagParam('auto')
  if (auto === true) lod.setAuto()

  window.__cube = { cam, lod, config, gl, renders: 0, submitted: 0 }
  const hud = new Hud()
  const minimap = new Minimap()
  const settings = new SettingsPanel({
    getShareUrl: () => `${location.origin}${location.pathname}${location.search}${serializeState()}`,
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

  if (params.get('panel') === '1') settings.show()

  let renderer = createRenderer(gl)
  let gpuTimer = new GpuTimer(gl)
  let maxPoint = queryMaxPointSize(gl)
  let lost = false
  let raf = 0
  let last = -1
  let lastUrlWrite = -1e9
  let lastWrittenHash = ''
  let drawnSig: number[] = []
  let renders = 0
  let generation = 0
  let previousRendered = false
  let cpuMs = 0
  let lastSceneChange = 0
  let cssWidth = canvas.clientWidth
  let cssHeight = canvas.clientHeight
  new ResizeObserver(() => {
    cssWidth = canvas.clientWidth
    cssHeight = canvas.clientHeight
  }).observe(canvas)

  const projScale = (height: number): number =>
    (0.5 * height) / Math.tan((config.fovDeg * Math.PI) / 360)

  function serializeState(): string {
    const parts: string[] = []
    const r2 = (v: number): number => Math.round(v * 100) / 100
    parts.push(`cam=${r2(cam.pos[0])},${r2(cam.pos[1])},${r2(cam.pos[2])}`)
    const yawDeg = ((((cam.yaw * 180) / Math.PI + 180) % 360) + 360) % 360 - 180
    parts.push(`yaw=${Math.round(yawDeg * 10) / 10}`)
    parts.push(`pitch=${Math.round(((cam.pitch * 180) / Math.PI) * 10) / 10}`)
    if (Math.round(config.fovDeg) !== Math.round(initial.fovDeg)) {
      parts.push(`fov=${Math.round(config.fovDeg)}`)
    }
    if (r2(config.spacing) !== r2(initial.spacing)) parts.push(`sp=${r2(config.spacing)}`)
    if (r2(config.radius) !== r2(initial.radius)) parts.push(`r=${r2(config.radius)}`)
    if (Math.round(config.far) !== Math.round(initial.far)) parts.push(`far=${Math.round(config.far)}`)
    if (r2(config.baseSpeed) !== r2(initial.baseSpeed)) {
      parts.push(`speed=${r2(config.baseSpeed)}`)
    }
    if (r2(config.sensitivity) !== r2(initial.sensitivity)) {
      parts.push(`sens=${r2(config.sensitivity)}`)
    }
    if (config.userRenderScale !== initial.userRenderScale) {
      parts.push(`scale=${config.userRenderScale}`)
    }
    if (config.targetFps !== initial.targetFps) parts.push(`fps=${config.targetFps}`)
    if (config.minAutoScale !== initial.minAutoScale) parts.push(`minscale=${config.minAutoScale}`)
    if (rgbToHex(config.bg) !== initial.bgHex) parts.push(`bg=${rgbToHex(config.bg)}`)
    if (!config.fog) parts.push('fog=0')
    if (!config.shading) parts.push('shade=0')
    if (!config.axes) parts.push('axes=0')
    if (config.debugView) parts.push('debug=1')
    if (!lod.auto) parts.push(`k=${lod.k}`)
    if (quadsDisabled) parts.push('quads=0')
    return `#${parts.join('&')}`
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    lost = true
    cancelAnimationFrame(raf)
    fallback.textContent = 'WebGL context lost — waiting for restore…'
    fallback.hidden = false
  })
  canvas.addEventListener('webglcontextrestored', () => {
    renderer = createRenderer(gl)
    gpuTimer = new GpuTimer(gl)
    lod.resetTiming()
    previousRendered = false
    maxPoint = queryMaxPointSize(gl)
    lost = false
    generation++
    fallback.hidden = true
    fallback.textContent =
      'WebGL2 is required to render the RGB color cube. Please use a current version of Chrome, Edge, Firefox, or Safari.'
    last = -1
    raf = requestAnimationFrame(frame)
  })

  document.addEventListener('visibilitychange', () => {
    last = -1
    previousRendered = false
    lod.resetTiming()
  })

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, config.dprCap)
    const w = Math.max(1, Math.round(cssWidth * dpr * config.renderScale))
    const h = Math.max(1, Math.round(cssHeight * dpr * config.renderScale))
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
    const started = performance.now()
    raf = requestAnimationFrame(frame)
    const frameMs = last < 0 ? 16.7 : now - last
    last = now
    if (lost || document.hidden) return
    const dt = Math.min(frameMs, 100) / 1000

    const intent = input.consume()
    cam.addLook(intent.lookDX, intent.lookDY)

    const gpuMs = gpuTimer.poll(now)
    const fullHeight = cssHeight * Math.min(window.devicePixelRatio || 1, config.dprCap) * config.userRenderScale
    const k = lod.update(now, frameMs, cam.distanceToCube(config.spacing), projScale(fullHeight),
      previousRendered, gpuMs === undefined ? undefined : gpuMs + cpuMs)
    config.renderScale = lod.auto
      ? lod.effectiveScale(config.userRenderScale)
      : config.userRenderScale
    resize()

    const projScaleValue = projScale(canvas.height)
    cam.update(dt, intent)
    cam.updateProj(canvas.width / canvas.height)

    const sig = [
      cam.pos[0], cam.pos[1], cam.pos[2], cam.yaw, cam.pitch,
      k, canvas.width, canvas.height, generation,
      config.fovDeg, config.spacing, config.radius, config.far,
      config.fog ? 1 : 0, config.shading ? 1 : 0, config.axes ? 1 : 0,
      config.debugView ? 1 : 0, config.bg[0], config.bg[1], config.bg[2],
      config.renderScale, config.maxInstances,
    ]
    let dirty = sig.length !== drawnSig.length
    for (let i = 0; !dirty && i < sig.length; i++) {
      if (sig[i] !== drawnSig[i]) dirty = true
    }

    if (dirty) {
      lastSceneChange = now
      drawnSig = sig
      renders++
      gpuTimer.begin()

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(config.bg[0], config.bg[1], config.bg[2], 1)
      gl.enable(gl.DEPTH_TEST)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

      const state: FrameState = {
        view: cam.view,
        proj: cam.proj,
        projScale: projScaleValue,
        maxPoint,
        n: config.latticeSize / k,
        k,
        spacing: config.spacing,
        aspect: canvas.width / canvas.height,
        tanHalf: Math.tan((config.fovDeg * Math.PI) / 360),
        fogRange: [config.far * config.fogStartFrac, config.far],
      }
      renderer.points.render(state)
      const quadCount = renderer.quads.build(cam.pos, k, projScaleValue, maxPoint)
      renderer.quads.render(state, quadCount)
      renderer.axes.render(state)
      gpuTimer.end()
    }

    window.__cube!.renders = renders
    window.__cube!.submitted = renderer.points.submitted
    previousRendered = dirty
    hud.update(now, lod.emaMs, config.baseSpeed, cameraRgb())
    if (hud.visible) minimap.update(cam, canvas.width / canvas.height)
    settings.sync()

    // Updating browser history while dragging can interrupt frame delivery.
    // Persist once movement settles;
    if (now - lastUrlWrite >= 500 && now - lastSceneChange >= 300) {
      lastUrlWrite = now
      const hash = serializeState()
      if (hash !== lastWrittenHash) {
        lastWrittenHash = hash
        history.replaceState(null, '', hash)
      }
    }
    cpuMs = performance.now() - started
  }

  raf = requestAnimationFrame(frame)
}

main()

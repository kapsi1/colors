import { config } from './config'

export interface SettingsLodHooks {
  getShareUrl(): string
  getLod(): { auto: boolean; k: number }
  setLodManual(k: number): void
  setLodAuto(): void
}

const SPEED_MIN = config.minSpeed
const SPEED_MAX = config.maxSpeed
const LOG_SPAN = Math.log(SPEED_MAX / SPEED_MIN)

export function speedToT(v: number): number {
  return Math.log(v / SPEED_MIN) / LOG_SPAN
}

export function tToSpeed(t: number): number {
  return SPEED_MIN * Math.exp(t * LOG_SPAN)
}

export function rgbToHex(c: [number, number, number]): string {
  const h = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

export class SettingsPanel {
  open = false
  private panel: HTMLElement
  private gear: HTMLButtonElement
  private lodHooks: SettingsLodHooks
  private inp: Record<string, HTMLInputElement> = {}
  private sel: Record<string, HTMLSelectElement> = {}
  private val: Record<string, HTMLElement> = {}
  private lastSync = ''

  constructor(lodHooks: SettingsLodHooks) {
    this.lodHooks = lodHooks
    this.panel = document.getElementById('panel')!
    this.gear = document.getElementById('gear') as HTMLButtonElement
    this.build()
    this.gear.addEventListener('pointerdown', (e) => e.preventDefault())
    this.gear.addEventListener('click', () => this.toggle())
    for (const target of [this.panel, this.gear]) {
      for (const type of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick', 'contextmenu']) {
        target.addEventListener(type, (e) => e.stopPropagation())
      }
    }
    this.sync(true)
  }

  toggle(): void {
    if (this.open) this.close()
    else this.show()
  }

  show(): void {
    this.open = true
    this.panel.hidden = false
    this.gear.setAttribute('aria-expanded', 'true')
    this.sync(true)
  }

  close(): void {
    this.open = false
    this.panel.hidden = true
    this.gear.setAttribute('aria-expanded', 'false')
    const ae = document.activeElement
    if (ae instanceof HTMLElement && this.panel.contains(ae)) ae.blur()
  }

  setChromeVisible(v: boolean): void {
    this.gear.hidden = !v
    if (!v) this.close()
  }

  private row(id: string, label: string, control: string): string {
    return `<div class="row"><span>${label}</span>${control}<span class="val" id="v-${id}"></span></div>`
  }

  private build(): void {
    this.panel.innerHTML = `
      <h3>Settings</h3>
      ${this.row('spacing', 'Sphere spacing', '<input type="range" id="set-spacing" min="0.5" max="2" step="0.05">')}
      ${this.row('radius', 'Sphere radius', '<input type="range" id="set-radius" min="0.02" max="1.2" step="0.01">')}
      ${this.row('far', 'View distance', '<input type="range" id="set-far" min="100" max="1500" step="10">')}
      ${this.row('speed', 'Move speed', '<input type="range" id="set-speed" min="0" max="1" step="0.005">')}
      ${this.row('sens', 'Mouse sensitivity', '<input type="range" id="set-sens" min="0.1" max="3" step="0.05">')}
      ${this.row('fov', 'Field of view', '<input type="range" id="set-fov" min="40" max="100" step="1">')}
      <div class="row">
        <span>LOD</span>
        <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="set-lodauto">auto</label>
        <select id="set-lodk">
          ${config.lodValues.map((v) => `<option value="${v}">${v}</option>`).join('')}
        </select>
      </div>
      ${this.row('fps', 'Target FPS', '<input aria-label="Target FPS" type="range" id="set-fps" min="60" max="144" step="1">')}
      <div class="row"><span>Minimum auto scale</span><select aria-label="Minimum auto scale" id="set-minscale"><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="0.33">33%</option></select></div>
      <p style="font-size:11px;line-height:1.4;color:#666">Auto LOD adjusts resolution and sphere detail to target your FPS. Minimum scale is relative to the render scale below. Actual FPS also depends on your display and hardware.</p>
      <div class="row"><span>Render scale</span><select id="set-scale"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option></select><span class="val" id="v-scale"></span></div>
      <div class="row"><span>Background</span><input type="color" id="set-bg"><span class="val" id="v-bg"></span></div>
      <div class="row"><span>Depth-cue fog</span><input type="checkbox" id="set-fog"></div>
      <div class="row"><span>Subtle shading</span><input type="checkbox" id="set-shade"></div>
      <div class="row"><span>Outline</span><input type="checkbox" id="set-axes"></div>
      <h3>Debug</h3>
      <div class="row"><span>Dist/normal</span><input type="checkbox" id="set-debug"></div>
      <div style="margin:4px 0 2px;color:#666;font-size:11px;line-height:1.4;">
        R = distance (white = close, scale 0&ndash;8 units) &middot; G = |normal.x| &middot; B = |normal.y|
      </div>
    `
    const q = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
    this.inp.spacing = q<HTMLInputElement>('set-spacing')
    this.inp.radius = q<HTMLInputElement>('set-radius')
    this.inp.far = q<HTMLInputElement>('set-far')
    this.inp.speed = q<HTMLInputElement>('set-speed')
    this.inp.sens = q<HTMLInputElement>('set-sens')
    this.inp.fov = q<HTMLInputElement>('set-fov')
    this.inp.lodauto = q<HTMLInputElement>('set-lodauto')
    this.sel.lodk = q<HTMLSelectElement>('set-lodk')
    this.sel.scale = q<HTMLSelectElement>('set-scale')
    this.inp.fps = q<HTMLInputElement>('set-fps')
    this.sel.minscale = q<HTMLSelectElement>('set-minscale')
    this.inp.bg = q<HTMLInputElement>('set-bg')
    this.inp.fog = q<HTMLInputElement>('set-fog')
    this.inp.shade = q<HTMLInputElement>('set-shade')
    this.inp.axes = q<HTMLInputElement>('set-axes')
    this.inp.debug = q<HTMLInputElement>('set-debug')
    for (const id of ['spacing', 'radius', 'far', 'speed', 'sens', 'fov', 'scale', 'bg', 'fps']) {
      this.val[id] = q<HTMLElement>(`v-${id}`)
    }
    this.inp.spacing.addEventListener('input', () => {
      config.spacing = Number(this.inp.spacing.value)
      this.clampRadius()
      this.sync(true)
    })
    this.inp.radius.addEventListener('input', () => {
      config.radius = Number(this.inp.radius.value)
      this.sync(true)
    })
    this.inp.far.addEventListener('input', () => {
      config.far = Number(this.inp.far.value)
      this.sync(true)
    })
    this.inp.speed.addEventListener('input', () => {
      config.baseSpeed = tToSpeed(Number(this.inp.speed.value))
      this.sync(true)
    })
    this.inp.sens.addEventListener('input', () => {
      config.sensitivity = Number(this.inp.sens.value)
      this.sync(true)
    })
    this.inp.fov.addEventListener('input', () => {
      config.fovDeg = Number(this.inp.fov.value)
      this.sync(true)
    })
    this.inp.lodauto.addEventListener('change', () => {
      if (this.inp.lodauto.checked) this.lodHooks.setLodAuto()
      else this.lodHooks.setLodManual(this.lodHooks.getLod().k)
      this.sync(true)
    })
    this.sel.lodk.addEventListener('change', () => {
      this.lodHooks.setLodManual(Number(this.sel.lodk.value))
      this.sync(true)
    })
    this.sel.scale.addEventListener('change', () => {
      config.userRenderScale = Number(this.sel.scale.value)
      this.sync(true)
    })
    this.inp.fps.addEventListener('input', () => {
      config.targetFps = Number(this.inp.fps.value)
      this.sync(true)
    })
    this.sel.minscale.addEventListener('change', () => {
      config.minAutoScale = Number(this.sel.minscale.value)
      this.sync(true)
    })
    this.inp.bg.addEventListener('input', () => {
      config.bg = hexToRgb(this.inp.bg.value)
      this.sync(true)
    })
    this.inp.fog.addEventListener('change', () => {
      config.fog = this.inp.fog.checked
      this.sync(true)
    })
    this.inp.shade.addEventListener('change', () => {
      config.shading = this.inp.shade.checked
      this.sync(true)
    })
    this.inp.axes.addEventListener('change', () => {
      config.axes = this.inp.axes.checked
      this.sync(true)
    })
    this.inp.debug.addEventListener('change', () => {
      config.debugView = this.inp.debug.checked
      this.sync(true)
    })
  }

  private clampRadius(): void {
    const max = (config.spacing - 0.02) / 2
    config.radius = Math.min(Math.max(config.radius, 0.02), max)
  }

  sync(force = false): void {
    if (!this.open && !force) return
    const lod = this.lodHooks.getLod()
    const key = JSON.stringify([
      config.spacing,
      config.radius,
      config.far,
      config.baseSpeed,
      config.sensitivity,
      config.fovDeg,
      lod.auto,
      lod.k,
      config.renderScale,
      config.userRenderScale,
      config.targetFps,
      config.minAutoScale,
      rgbToHex(config.bg),
      config.fog,
      config.shading,
      config.axes,
      config.debugView,
    ])
    if (!force && key === this.lastSync) return
    this.lastSync = key
    this.inp.spacing.value = String(config.spacing)
    this.inp.radius.max = String((config.spacing - 0.02) / 2)
    this.inp.radius.min = '0.02'
    this.inp.radius.value = String(config.radius)
    this.inp.far.value = String(config.far)
    this.inp.speed.value = String(speedToT(config.baseSpeed))
    this.inp.sens.value = String(config.sensitivity)
    this.inp.fov.value = String(config.fovDeg)
    this.inp.lodauto.checked = lod.auto
    this.sel.lodk.value = String(lod.k)
    this.sel.lodk.disabled = lod.auto
    this.sel.scale.value = String(config.userRenderScale)
    this.inp.fps.value = String(config.targetFps)
    this.inp.fps.disabled = !lod.auto
    this.sel.minscale.value = String(config.minAutoScale)
    this.sel.minscale.disabled = !lod.auto
    this.inp.bg.value = rgbToHex(config.bg)
    this.inp.fog.checked = config.fog
    this.inp.shade.checked = config.shading
    this.inp.axes.checked = config.axes
    this.inp.debug.checked = config.debugView
    this.val.spacing.textContent = config.spacing.toFixed(2)
    this.val.radius.textContent = config.radius.toFixed(2)
    this.val.far.textContent = String(Math.round(config.far))
    this.val.speed.textContent = config.baseSpeed.toFixed(1)
    this.val.sens.textContent = `${config.sensitivity.toFixed(2)}×`
    this.val.fov.textContent = `${Math.round(config.fovDeg)}°`
    this.val.scale.textContent = `${Math.round(config.renderScale * 100)}%`
    this.val.fps.textContent = String(config.targetFps)
    this.val.bg.textContent = rgbToHex(config.bg)
  }
}

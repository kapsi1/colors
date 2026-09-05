import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from './loadTs.mjs'

const { config } = await load('../src/config.ts')
const defaults = structuredClone(config)

function makeClassList() {
  const set = new Set()
  return {
    toggle(name, on) { if (on) set.add(name); else set.delete(name) },
    has: (name) => set.has(name),
  }
}

function makeEl(extra = {}) {
  const handlers = {}
  return {
    style: {},
    handlers,
    addEventListener(type, fn) { (handlers[type] ??= []).push(fn) },
    setAttribute() {},
    tabIndex: 0,
    ...extra,
  }
}

const fire = (el, type, ev) => el.handlers[type].forEach((fn) => fn(ev))

let mqlListeners = []
let matches = false
function installPhoneDom() {
  mqlListeners = []
  matches = false
  global.window = {
    matchMedia: () => ({
      get matches() { return matches },
      addEventListener: (_type, fn) => mqlListeners.push(fn),
    }),
  }
  global.document = { body: { classList: makeClassList() } }
}

test('phone param overrides detection and toggles the body class', async () => {
  installPhoneDom()
  const { initPhoneMode } = await load('../src/phone.ts')
  initPhoneMode(true)
  assert.equal(config.phoneMode, true)
  assert.ok(document.body.classList.has('phone'))
  initPhoneMode(false)
  assert.equal(config.phoneMode, false)
  assert.ok(!document.body.classList.has('phone'))
})

test('without the param, phone mode follows the media query', async () => {
  installPhoneDom()
  const { initPhoneMode } = await load('../src/phone.ts')
  initPhoneMode(null)
  assert.equal(config.phoneMode, false)
  assert.ok(!document.body.classList.has('phone'))
  matches = true
  for (const fn of mqlListeners) fn({ matches: true })
  assert.equal(config.phoneMode, true)
  assert.ok(document.body.classList.has('phone'))
  matches = false
  for (const fn of mqlListeners) fn({ matches: false })
  assert.equal(config.phoneMode, false)
})

test('a touch held on the canvas moves forward only in phone mode', async () => {
  const listeners = {}
  const canvas = {
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn) },
    classList: { add() {}, remove() {} },
    setPointerCapture() {},
    hasPointerCapture: () => false,
    releasePointerCapture() {},
    requestPointerLock: () => Promise.resolve(),
  }
  global.window = { addEventListener() {} }
  global.document = { addEventListener() {}, activeElement: null, pointerLockElement: null }
  global.HTMLElement = class HTMLElement {}
  const { initInput } = await load('../src/input.ts')
  const input = initInput(canvas, {
    togglePanel() {}, closePanel() {}, toggleHud() {},
    setLodManual() {}, setLodAuto() {}, toggleFullscreen() {},
  })
  const fire2 = (type, ev) => listeners[type].forEach((fn) => fn(ev))
  const touch = { button: 0, pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 10 }
  fire2('pointerdown', touch)
  Object.assign(config, structuredClone(defaults))
  config.phoneMode = true
  assert.equal(input.consume().forward, 1)
  config.phoneMode = false
  assert.equal(input.consume().forward, 0, 'desktop touch does not move')
  config.phoneMode = true
  assert.equal(input.consume().forward, 1, 'touch still held keeps moving')
  fire2('pointerup', touch)
  assert.equal(input.consume().forward, 0, 'release stops the motion')
  fire2('pointerdown', { button: 0, pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0 })
  assert.equal(input.consume().forward, 0, 'mouse drag never moves forward')
})

test('speed slider maps track position logarithmically and shows the speed', async () => {
  installPhoneDom()
  const els = {
    'speed-slider': makeEl(),
    'speed-track': makeEl({ setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} }),
    'speed-fill': makeEl(),
    'speed-thumb': makeEl(),
    'speed-value': makeEl(),
  }
  global.document = { ...global.document, getElementById: (id) => els[id] }
  const { SpeedSlider } = await load('../src/speedSlider.ts')
  const { speedToT, tToSpeed } = await load('../src/settings.ts')
  Object.assign(config, structuredClone(defaults))

  const slider = new SpeedSlider()
  const t0 = speedToT(config.baseSpeed)
  assert.equal(els['speed-value'].textContent, '25')
  assert.equal(els['speed-fill'].style.height, `${(t0 * 100).toFixed(2)}%`)
  assert.equal(els['speed-thumb'].style.top, `${((1 - t0) * 100).toFixed(2)}%`, 'thumb rides on the fill top edge')
  assert.ok(Math.abs(speedToT(tToSpeed(0.4)) - 0.4) < 1e-9, 'mapping round-trips')

  els['speed-track'].getBoundingClientRect = () => ({ top: 200, height: 300 })
  fire(els['speed-track'], 'pointerdown', { pointerId: 1, clientY: 200 })
  assert.ok(Math.abs(config.baseSpeed - config.maxSpeed) < 0.01, 'top of track = max speed')
  assert.equal(els['speed-value'].textContent, '100')
  fire(els['speed-track'], 'pointermove', { pointerId: 1, clientY: 350 })
  assert.ok(Math.abs(config.baseSpeed / tToSpeed(0.5) - 1) < 1e-9, 'mid track = geometric mean speed')
  fire(els['speed-track'], 'pointerup', { pointerId: 1 })
  const settled = config.baseSpeed
  fire(els['speed-track'], 'pointermove', { pointerId: 1, clientY: 200 })
  assert.equal(config.baseSpeed, settled, 'moves after release are ignored')
  fire(els['speed-track'], 'pointerdown', { pointerId: 1, clientY: 500 })
  assert.ok(Math.abs(config.baseSpeed - config.minSpeed) < 0.01, 'bottom of track = min speed')
  assert.equal(els['speed-value'].textContent, '0.1')

  const before = config.baseSpeed
  fire(els['speed-slider'], 'keydown', { key: 'ArrowUp', shiftKey: false, preventDefault() {} })
  assert.ok(config.baseSpeed > before, 'arrow keys nudge the speed')
  slider.refresh()
  assert.ok(els['speed-fill'].style.height.endsWith('%'))
})

test('index.html ships the slider markup and phone-mode CSS overrides', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  for (const id of ['speed-slider', 'speed-value', 'speed-track', 'speed-fill', 'speed-thumb']) {
    assert.ok(html.includes(`id="${id}"`), id)
  }
  assert.match(html, /#speed-slider\s*{[^}]*display:\s*none/, 'slider is desktop-hidden by default')
  for (const rule of ['body.phone #speed-slider', 'body.phone #speedo', 'body.phone #help', 'body.phone #hint', 'body.phone #info', 'body.phone #model-row']) {
    assert.ok(html.includes(rule), rule)
  }
  assert.match(html, /body\.phone #speedo\s*{[^}]*display:\s*none/, 'speedometer hidden on phones')
  assert.match(html, /body\.phone #help\s*{[^}]*display:\s*none/, 'help button hidden on phones')
})

test('main.ts wires phone mode, the slider and its persistence; hud skips the dial', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  assert.match(main, /initPhoneMode\(phoneParam\)/)
  assert.match(main, /new SpeedSlider\(\)/)
  assert.match(main, /speedSlider\.refresh\(\)/)
  assert.match(main, /phone=\$\{phoneParam \? '1' : '0'\}/, 'forced phone mode persists in the hash')
  const hud = readFileSync(new URL('../src/hud.ts', import.meta.url), 'utf8')
  assert.match(hud, /if \(!config\.phoneMode\) this\.speedo\.update/, 'dial is not updated on phones')
})

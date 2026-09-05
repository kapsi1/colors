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

function makeInputCanvas() {
  const listeners = {}
  return {
    listeners,
    canvas: {
      addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn) },
      classList: { add() {}, remove() {} },
      clientWidth: 400,
      setPointerCapture() {},
      hasPointerCapture: () => false,
      releasePointerCapture() {},
      requestPointerLock: () => Promise.resolve(),
    },
  }
}

async function inputHarness() {
  const { canvas, listeners } = makeInputCanvas()
  global.window = { addEventListener() {}, innerWidth: 400, innerHeight: 800 }
  global.document = {
    addEventListener() {},
    activeElement: null,
    pointerLockElement: null,
    getElementById: (id) => makeEl({ hidden: true, id }),
  }
  global.HTMLElement = class HTMLElement {}
  const { initInput } = await load('../src/input.ts')
  const input = initInput(canvas, {
    togglePanel() {}, closePanel() {}, toggleHud() {},
    setLodManual() {}, setLodAuto() {}, toggleFullscreen() {},
  })
  const fire2 = (type, ev) => listeners[type].forEach((fn) => fn(ev))
  return { input, fire2 }
}

test('phone joystick: a left-half touch spawns the stick and deflection moves', async () => {
  const { input, fire2 } = await inputHarness()
  Object.assign(config, structuredClone(defaults))
  config.phoneMode = true
  fire2('pointerdown', { button: 0, pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 600 })
  let intent = input.consume()
  assert.equal(intent.forward, 0, 'untouched stick is neutral')
  assert.equal(intent.magnitude, 0)

  fire2('pointermove', { pointerId: 1, clientX: 100, clientY: 500 })
  intent = input.consume()
  assert.equal(intent.forward, 1, 'full upward deflection = full forward')
  assert.equal(intent.strafe, 0)
  assert.equal(intent.magnitude, 1)

  fire2('pointermove', { pointerId: 1, clientX: 150, clientY: 600 })
  intent = input.consume()
  assert.equal(intent.strafe, 1, 'rightward deflection = strafe right')
  assert.equal(intent.forward, 0)

  fire2('pointermove', { pointerId: 1, clientX: 100, clientY: 596 })
  intent = input.consume()
  assert.equal(intent.magnitude, 0, 'inside the dead zone nothing moves')

  fire2('pointerup', { pointerId: 1 })
  intent = input.consume()
  assert.equal(intent.magnitude, 0, 'release stops the stick')
})

test('phone joystick: right-half and desktop touches never move, they look', async () => {
  const { input, fire2 } = await inputHarness()
  Object.assign(config, structuredClone(defaults))
  config.phoneMode = true
  fire2('pointerdown', { button: 0, pointerType: 'touch', pointerId: 2, clientX: 300, clientY: 400 })
  fire2('pointermove', { pointerId: 2, clientX: 300, clientY: 300 })
  let intent = input.consume()
  assert.equal(intent.forward, 0)
  assert.equal(intent.magnitude, 0, 'neutral stick has zero magnitude')
  assert.notEqual(intent.lookDY, 0, 'right-half drag steers the view')
  fire2('pointerup', { pointerId: 2 })

  config.phoneMode = false
  fire2('pointerdown', { button: 0, pointerType: 'touch', pointerId: 3, clientX: 100, clientY: 400 })
  fire2('pointermove', { pointerId: 3, clientX: 100, clientY: 300 })
  intent = input.consume()
  assert.equal(intent.forward, 0)
  assert.equal(intent.magnitude, 0)
  assert.notEqual(intent.lookDY, 0, 'outside phone mode every touch just looks')
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

test('joystick widget: clamps on screen, starts neutral, fades on release', async () => {
  installPhoneDom()
  const els = {
    joystick: makeEl({ hidden: true }),
    'joystick-knob': makeEl(),
  }
  global.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 400, innerHeight: 800 }
  global.document = { body: { classList: makeClassList() }, getElementById: (id) => els[id] }
  const { Joystick } = await load('../src/joystick.ts')
  const joy = new Joystick()

  joy.begin(10, 400)
  assert.equal(els.joystick.hidden, false, 'spawned visible')
  assert.equal(els.joystick.style.left, '8px', 'ring clamped inside the left edge')
  assert.equal(joy.stick().magnitude, 0, 'starts neutral despite the clamp offset')
  joy.move(110, 400)
  assert.equal(joy.stick().strafe, 1, 'deflection measured from the touch, not the clamp')
  assert.equal(joy.stick().magnitude, 1)
  joy.move(18, 400)
  assert.equal(joy.stick().magnitude, 0, 'dead zone')
  joy.move(10, 300)
  assert.equal(joy.stick().forward, 1)
  joy.end()
  assert.equal(els.joystick.hidden, true)
  assert.equal(joy.stick().magnitude, 0)
  assert.equal(joy.stick().forward, 0)
})

test('index.html ships the slider markup and phone-mode CSS overrides', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  for (const id of ['speed-slider', 'speed-value', 'speed-track', 'speed-fill', 'speed-thumb', 'joystick', 'joystick-knob']) {
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

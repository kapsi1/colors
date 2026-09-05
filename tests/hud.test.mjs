import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from './loadTs.mjs'

global.window = { devicePixelRatio: 1 }
const mockCtx = {
  setTransform() {},
  clearRect() {},
  beginPath() {},
  arc() {},
  stroke() {},
  moveTo() {},
  lineTo() {},
  fillText() {},
  fill() {},
}
const makeEl = (extra = {}) => ({
  hidden: false,
  textContent: '',
  style: {},
  setAttribute() {},
  addEventListener() {},
  ...extra,
})
let els
function resetEls() {
  els = {
    hud: makeEl({ hidden: false }),
    hint: makeEl({ hidden: false }),
    help: makeEl(),
    'info-fps': makeEl(),
    'cam-rgb': makeEl(),
    'cam-hex': makeEl(),
    'cam-swatch': makeEl({ style: { background: '' } }),
    speedo: { width: 0, height: 0, getContext: () => mockCtx },
  }
}
resetEls()
global.document = { getElementById: (id) => els[id] ?? null }

const { Hud } = await load('../src/hud.ts')
const { config } = await load('../src/config.ts')

function newHud() {
  resetEls()
  return { hud: new Hud(), els }
}

test('index.html shows swatch left of a two-line rgb/hex block inside #info', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.ok(html.includes('<div id="info">'), 'container renamed to info')
  assert.ok(!/\bid="fps"/.test(html), 'old fps container id removed')
  assert.ok(html.includes('<div id="info-fps">'), 'fps line renamed to info-fps')
  const sw = html.indexOf('id="cam-swatch"')
  const rgb = html.indexOf('id="cam-rgb"')
  const hex = html.indexOf('id="cam-hex"')
  assert.ok(sw !== -1 && rgb !== -1 && hex !== -1, 'swatch, rgb and hex exist')
  assert.ok(sw < rgb, 'swatch before rgb')
  assert.ok(rgb < hex, 'rgb before hex (hex on the second line)')
  assert.match(html, /#cam-swatch\s*{[^}]*width:\s*3\.2em/, 'swatch spans the two lines (2 × 1.6em)')
  assert.match(html, /#cam-swatch\s*{[^}]*height:\s*3\.2em/, 'swatch height matches both lines')
  assert.match(html, /#cam-text\s*{[^}]*min-width:\s*20ch/, 'widest hsv value is reserved')
})

test('hud.ts targets the renamed info ids', () => {
  const src = readFileSync(new URL('../src/hud.ts', import.meta.url), 'utf8')
  assert.ok(src.includes("getElementById('info-fps')"), 'fps line looked up as info-fps')
  assert.ok(!src.includes("'fps-line'") && !src.includes("'fps-cam'"), 'old ids gone')
})

test('Hud setVisible hides the help button together with the HUD', () => {
  const { hud, els: e } = newHud()
  hud.setVisible(false)
  assert.equal(e.hud.hidden, true)
  assert.equal(e.help.hidden, true)
  hud.setVisible(true)
  assert.equal(e.hud.hidden, false)
  assert.equal(e.help.hidden, false)
})

test('main hides settings chrome with the HUD and gates Tab on HUD visibility', () => {
  const src = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  assert.match(src, /settings\.setChromeVisible\(hud\.visible\)/, 'H toggles settings chrome')
  assert.match(src, /if \(hud\.visible\) settings\.toggle\(\)/, 'Tab cannot open the hidden panel')
})

test('Hud update shows rgb, spanning swatch color and hex below it', () => {
  const { hud, els: e } = newHud()
  hud.update(0, 16, 10, [0, 0, 0])
  assert.equal(e['cam-rgb'].textContent, 'rgb(0, 0, 0)')
  assert.equal(e['cam-hex'].textContent, '#000000')
  assert.equal(e['cam-swatch'].style.background, 'rgb(0,0,0)')

  hud.update(300, 16, 10, [255, 255, 255])
  assert.equal(e['cam-rgb'].textContent, 'rgb(255, 255, 255)')
  assert.equal(e['cam-hex'].textContent, '#ffffff')

  hud.update(600, 16, 10, [255, 0, 0])
  assert.equal(e['cam-hex'].textContent, '#ff0000')

  hud.update(900, 16, 10, [1, 10, 15])
  assert.equal(e['cam-hex'].textContent, '#010a0f')

  hud.update(1200, 16, 10, [16, 32, 48])
  assert.equal(e['cam-hex'].textContent, '#102030')
})

test('Hud update outside cube clears hex and shows transparent swatch', () => {
  const { hud, els: e } = newHud()
  hud.update(0, 16, 10, [10, 20, 30])
  assert.equal(e['cam-hex'].textContent, '#0a141e')
  hud.update(400, 16, 10, null)
  assert.equal(e['cam-rgb'].textContent, 'outside cube')
  assert.equal(e['cam-hex'].textContent, '')
  assert.equal(e['cam-swatch'].style.background, 'transparent')
})

test('Hud update shows the model value in place of rgb and keeps hex from rgb', () => {
  const { hud, els: e } = newHud()
  hud.update(0, 16, 10, [128, 128, 128], 'hsl(0, 0%, 50%)')
  assert.equal(e['cam-rgb'].textContent, 'hsl(0, 0%, 50%)')
  assert.equal(e['cam-hex'].textContent, '#808080')
  assert.equal(e['cam-swatch'].style.background, 'rgb(128,128,128)')

  hud.update(300, 16, 10, [255, 0, 0], 'hsv(0, 100%, 100%)')
  assert.equal(e['cam-rgb'].textContent, 'hsv(0, 100%, 100%)')
  assert.equal(e['cam-hex'].textContent, '#ff0000')

  hud.update(600, 16, 10, [16, 32, 48], null)
  assert.equal(e['cam-rgb'].textContent, 'rgb(16, 32, 48)', 'null value falls back to rgb')

  config.colorModel = 'hsl'
  try {
    hud.update(900, 16, 10, null, null)
    assert.equal(e['cam-rgb'].textContent, 'outside cylinder')
    assert.equal(e['cam-hex'].textContent, '')
  } finally { config.colorModel = 'rgb' }
})

test('Hud throttles DOM writes to 4 Hz', () => {
  const { hud, els: e } = newHud()
  hud.update(0, 16, 10, [10, 20, 30])
  assert.equal(e['cam-rgb'].textContent, 'rgb(10, 20, 30)')
  hud.update(100, 16, 10, [20, 30, 40])
  assert.equal(e['cam-rgb'].textContent, 'rgb(10, 20, 30)', 'throttled')
  hud.update(300, 16, 10, [20, 30, 40])
  assert.equal(e['cam-rgb'].textContent, 'rgb(20, 30, 40)')
  assert.equal(e['cam-hex'].textContent, '#141e28')
})

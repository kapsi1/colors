import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './loadTs.mjs'

global.HTMLElement = class {}
global.window = { devicePixelRatio: 1 }

const els = new Map()
const makeEl = () => ({
  hidden: false,
  textContent: '',
  innerHTML: '',
  value: '',
  checked: false,
  disabled: false,
  min: '',
  max: '',
  handlers: {},
  setAttribute() {},
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn) },
  blur() {},
})
global.document = {
  getElementById: (id) => {
    if (!els.has(id)) els.set(id, makeEl())
    return els.get(id)
  },
  activeElement: null,
}

const { SettingsPanel } = await load('../src/settings.ts')

let resets = 0
function newPanel() {
  els.clear()
  resets = 0
  return new SettingsPanel({
    getShareUrl: () => '',
    getLod: () => ({ auto: true, k: 1 }),
    setLodManual() {},
    setLodAuto() {},
    resetCamera: () => { resets++ },
  })
}

test('setChromeVisible hides the gear and closes an open panel with the HUD', () => {
  const s = newPanel()
  s.show()
  assert.equal(s.open, true)
  assert.equal(els.get('gear').hidden, false)
  s.setChromeVisible(false)
  assert.equal(els.get('gear').hidden, true)
  assert.equal(s.open, false)
  assert.equal(els.get('panel').hidden, true)
})

test('panel stays closed when the chrome returns; show still works afterwards', () => {
  const s = newPanel()
  s.show()
  s.setChromeVisible(false)
  s.setChromeVisible(true)
  assert.equal(els.get('gear').hidden, false)
  assert.equal(s.open, false)
  assert.equal(els.get('panel').hidden, true)
  s.show()
  assert.equal(s.open, true)
  assert.equal(els.get('panel').hidden, false)
})

test('the reset button hides with the chrome and triggers a camera reset on click', () => {
  const s = newPanel()
  s.setChromeVisible(false)
  assert.equal(els.get('reset').hidden, true, 'reset hidden together with the gear')
  s.setChromeVisible(true)
  assert.equal(els.get('reset').hidden, false)
  for (const fn of els.get('reset').handlers.click) fn({})
  assert.equal(resets, 1, 'click resets the camera')
})

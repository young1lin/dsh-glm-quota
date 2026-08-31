/**
 * Client-bundle smoke: executes client.js the way the browser module system
 * does (window.__ModuleLoader__.load handoff, injected require) with the real
 * React from the dsh profiles tree, then exercises apply(), the slot
 * registration, the quota source, the refresh callback, and an SSR render of
 * the panel in both wide and rail forms. Run: node client-smoke.mjs
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Resolve ONE self-consistent (react, react-dom) pair: react is required
// from the resolved react-dom's own tree, so both halves always come from the
// same node_modules chain — the dsh profiles copy when present, this repo's
// node_modules on CI. Mixed 18/19 copies (the profiles tree junctions into
// several nested react-dom instances) fail SSR with "Objects are not valid
// as a React child" because the two versions use different element symbols.
const resolvePair = (base) => {
  const baseRequire = createRequire(base)
  const reactDomPkg = baseRequire.resolve('react-dom/package.json')
  const pairRequire = createRequire(reactDomPkg)
  return { React: pairRequire('react'), renderToString: pairRequire('react-dom/server').renderToString }
}
let React, renderToString
try {
  ;({ React, renderToString } = resolvePair(join(homedir(), '.dsh', 'profiles', 'web', 'client-smoke.js')))
} catch {
  ;({ React, renderToString } = resolvePair(new URL('./package.json', import.meta.url)))
}

// --- minimal DOM stubs the factory and apply() touch ----------------------
const styleTags = []
const documentStub = {
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
  querySelector() { return null },
  createElement(tag) {
    return { tag, dataset: {}, textContent: '', style: {} }
  },
  head: { appendChild(el) { styleTags.push(el) } },
}
globalThis.document = documentStub

// --- capture the module handoff ------------------------------------------
let handoff = undefined
globalThis.window = { __ModuleLoader__: { load(h) { handoff = h } } }
const source = await readFile(new URL('./client.js', import.meta.url), 'utf8')
new Function('window', source)(globalThis.window)
assert.equal(handoff.id, 'dsh-glm-quota', 'handoff id matches the graph row id')

// --- materialize with an injected require over platform stubs ------------
const platform = {
  react: React,
  '@deepseek-ai/dsh-client-ui-primitives': {
    Tooltip: (props) => props.children,
    IconChevronDownOutline14: (props) => React.createElement('svg', { className: props.className, 'data-chevron': true }),
  },
}
const requireShim = (spec) => {
  assert.ok(spec in platform, 'module table answered: ' + spec)
  return platform[spec]
}
const exports_ = handoff.factory(requireShim)
assert.deepEqual(exports_.inject, ['slots'])
assert.equal(typeof exports_.apply, 'function')
assert.equal(styleTags.length, 1, 'style tag injected: ' + styleTags[0].dataset.pluginCss)

// --- apply() with a fake slot registry -----------------------------------
let registration = undefined
const disposers = []
const ctx = {
  effect: (register, label) => { const dispose = register(); disposers.push(dispose); return dispose },
  slots: {
    inject(name, reg) {
      assert.equal(name, 'sidebar.footer.action')
      registration = reg()
    },
    register(spec, component) {
      assert.equal(spec.name, 'sidebar.footer.action')
      assert.equal(spec.id, 'dsh-glm-quota')
      return { spec, component }
    },
  },
}
const served = {
  planLevel: 'Pro',
  windows: [
    { id: '5h', label: '5h', percent: 42.5, resetAt: Date.now() + 90 * 60_000 + 30_000 },
    { id: '7d', label: '7d', percent: 17.2, resetAt: Date.now() + 3 * 24 * 3600_000 + 30_000 },
    { id: 'mcp', label: 'MCP', percent: 40, used: 12, limit: 30, resetAt: 0 },
  ],
  fetchedAt: Date.now(),
  retryAt: 0,
  error: '',
}
let fetchCalls = []
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url))
  return { ok: true, json: async () => served }
}
exports_.apply(ctx)
assert.equal(fetchCalls.length, 1, 'initial poll fired: ' + fetchCalls[0])
await new Promise((r) => { setTimeout(r, 10) })

// The registration the panel rides: component + inject face (hooks + refresh).
assert.ok(registration !== undefined)
const face = registration.spec.inject()
assert.equal(typeof face.refresh, 'function')
const source_ = face.hooks.quota
assert.equal(typeof source_.getSnapshot, 'function')
assert.equal(typeof source_.subscribe, 'function')
let snap = source_.getSnapshot()
assert.equal(snap.phase, 'ready', 'poll published the served projection')
assert.equal(snap.data.windows.length, 3)
let notified = 0
const off = source_.subscribe(() => { notified += 1 })

// refresh() hits the forced endpoint.
face.refresh()
await new Promise((r) => { setTimeout(r, 10) })
assert.ok(fetchCalls.some((u) => u.includes('refresh=1')), 'refresh=1 fetch fired')
off()

// --- SSR render: wide panel shows bars, weekly row, MCP counts, next reset.
const hookOf = (snap_) => (sel) => sel(snap_)
const wide = renderToString(React.createElement(registration.component, {
  wide: true,
  useQuota: hookOf(snap),
  refresh: () => {},
}))
assert.ok(wide.includes('GLM'), 'plan title rendered')
assert.ok(wide.includes('Pro'), 'plan level rendered')
assert.ok(wide.includes('周限'), 'weekly row rendered with the 周限 label')
assert.ok(wide.includes('MCP'), 'mcp row rendered')
assert.ok(wide.includes('12/30'), 'mcp counts rendered')
assert.ok(wide.includes('43%'), '5h percent rendered')
assert.ok(wide.includes('17%'), 'weekly percent rendered')
// Per-window reset footer: 5h resets in 1h30m, weekly in 3d0h (both visible, not nearest-only).
assert.ok(wide.includes('↻ 5h 剩1h30m'), 'footer lists the 5h reset countdown')
assert.ok(wide.includes('周限 剩3d0h'), 'footer lists the weekly reset countdown')
assert.ok(wide.includes('重置于'), 'footer tooltip carries absolute reset times')
assert.ok(wide.includes('dshGlmRow t2'), '5h tier class: cyan at 42.5%')
assert.ok(wide.includes('dshGlmRow t0'), 'weekly tier class: bright green at 17.2%')

// Rail form: worst-percent number with its tier color.
const rail = renderToString(React.createElement(registration.component, {
  wide: false,
  useQuota: hookOf(snap),
  refresh: () => {},
}))
assert.ok(rail.includes('dshGlm'), 'rail block rendered')
assert.ok(rail.includes('rail t2'), 'rail tier class: cyan at worst 42.5%')
assert.ok(rail.includes('dshGlmRingFill'), 'rail renders the progress ring')
assert.ok(/stroke-dasharray="[\d.]+ 97/.test(rail), 'ring arc encodes the worst percent: ' + (rail.match(/stroke-dasharray="[^"]+"/) ?? [])[0])

// A plan without the weekly window renders no weekly row.
const noWeekly = { ...snap, data: { ...snap.data, windows: snap.data.windows.filter((w) => w.id !== '7d') } }
const wideNoWeekly = renderToString(React.createElement(registration.component, {
  wide: true,
  useQuota: hookOf(noWeekly),
  refresh: () => {},
}))
assert.ok(!wideNoWeekly.includes('dshGlmRow t0'), 'no weekly window: no weekly row')
assert.ok(!wideNoWeekly.includes('周限 剩'), 'no weekly window: no weekly reset in the footer')
// Collapse control ships on every wide render (body visibility is CSS-driven).
assert.ok(wideNoWeekly.includes('dshGlmCollapse'), 'collapse control rendered')
assert.ok(wideNoWeekly.includes('dshGlmBody'), 'body element present')

// Irrelevant host: the panel removes itself from the sidebar entirely.
const irrelevant = renderToString(React.createElement(registration.component, {
  wide: true,
  useQuota: hookOf({ ...snap, data: { ...snap.data, relevant: false } }),
  refresh: () => {},
}))
assert.equal(irrelevant, '', 'irrelevant host renders nothing')

// Release the poll interval so the process exits.
for (const dispose of disposers) dispose()
console.log('glm-quota client smoke: all assertions passed')

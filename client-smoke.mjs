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
assert.equal(handoff.id, '@young1lin/dsh-glm-quota', 'handoff id matches the graph row id')

// --- materialize with an injected require over platform stubs ------------
const platform = {
  react: React,
  '@deepseek-ai/dsh-client-ui-primitives': {
    Tooltip: (props) => props.children,
    IconChevronDownOutline14: (props) => React.createElement('svg', { className: props.className, 'data-chevron': true }),
    IconRefreshOutline14: (props) => React.createElement('svg', { className: props.className, 'data-refresh': true }),
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

// --- SSR render: wide card shows quota metrics, weekly data, MCP counts, and resets.
const hookOf = (snap_) => (sel) => sel(snap_)
const wide = renderToString(React.createElement(registration.component, {
  wide: true,
  useQuota: hookOf(snap),
  refresh: () => {},
}))
assert.ok(wide.includes('GLM'), 'plan title rendered')
assert.ok(wide.includes('Pro'), 'plan level rendered')
assert.ok(wide.includes('周额度'), 'weekly metric rendered only when the 7d window exists')
assert.ok(wide.includes('MCP 调用'), 'mcp metric rendered')
assert.ok(wide.includes('12'), 'mcp used count rendered')
assert.ok(wide.includes('/ 30'), 'mcp limit rendered')
assert.ok(wide.includes('43%'), '5h percent rendered')
assert.ok(wide.includes('17%'), 'weekly percent rendered')
// Each metric owns its countdown; the weekly reset can never hide behind the 5h reset.
assert.ok(wide.includes('1h30m 后重置'), '5h metric shows its reset countdown')
assert.ok(wide.includes('3d0h 后重置'), 'weekly metric shows its reset countdown')
assert.ok(wide.includes('重置于'), 'metric tooltip carries the absolute reset time')
assert.ok(wide.includes('dshGlmMetric t2'), '5h tier class: cyan at 42.5%')
assert.ok(wide.includes('dshGlmMetric t0'), 'weekly tier class: bright green at 17.2%')
assert.ok(wide.includes('dshGlmCompact'), 'wide mode keeps only one compact footer row in layout')
assert.ok(wide.includes('dshGlmPopover'), 'quota details render in a transient popover')
assert.ok(wide.includes('dshGlmGauge'), 'detail metrics use compact circular gauges instead of progress bars')
assert.ok(wide.includes('dshGlmCompactRing'), 'compact status row carries a worst-window ring')
assert.ok(!wide.includes('dshGlmTrack'), 'the redesigned UI ships no linear progress tracks')

// Compact headline = worst TOKEN window: MCP counts never dominate it.
const mcpHeavy = { ...snap, data: { ...snap.data, windows: [
  { id: '5h', label: '5h', percent: 1, resetAt: Date.now() + 60 * 60_000 },
  { id: 'mcp', label: 'MCP', percent: 95, used: 950, limit: 1000, resetAt: 0 },
] } }
const wideMcpHeavy = renderToString(React.createElement(registration.component, {
  wide: true, useQuota: hookOf(mcpHeavy), refresh: () => {},
}))
assert.ok(wideMcpHeavy.includes('dshGlmCompactValue">1%<'), 'headline stays on the token quota (1%), not the 95% MCP bar')
assert.ok(wideMcpHeavy.includes('dshGlmCompactRing t0'), 'ring tier follows token windows')
// Two token windows: the closer-to-limit one leads the headline.
const weeklyHeavy = { ...snap, data: { ...snap.data, windows: [
  { id: '5h', label: '5h', percent: 5, resetAt: Date.now() + 60 * 60_000 },
  { id: '7d', label: '7d', percent: 10, resetAt: Date.now() + 5 * 24 * 3600_000 },
] } }
const wideWeeklyHeavy = renderToString(React.createElement(registration.component, {
  wide: true, useQuota: hookOf(weeklyHeavy), refresh: () => {},
}))
assert.ok(wideWeeklyHeavy.includes('dshGlmCompactValue">10%<'), 'headline takes the closer-to-limit token window (7d 10% over 5h 5%)')
// MCP-only data falls back to MCP so the headline never goes blank.
const mcpOnly = { ...snap, data: { ...snap.data, windows: [
  { id: 'mcp', label: 'MCP', percent: 95, used: 950, limit: 1000, resetAt: 0 },
] } }
const wideMcpOnly = renderToString(React.createElement(registration.component, {
  wide: true, useQuota: hookOf(mcpOnly), refresh: () => {},
}))
assert.ok(wideMcpOnly.includes('dshGlmCompactValue">95%<'), 'mcp-only fallback: headline shows MCP when no token window exists')

// Rail form: pure quota per window — the 5h ring and (on plans with a
// weekly limit) the 7d ring, percent inside and reset countdown under; no
// plan level, no MCP counts.
const rail = renderToString(React.createElement(registration.component, {
  wide: false,
  useQuota: hookOf(snap),
  refresh: () => {},
}))
assert.ok(rail.includes('class="dshGlmRail"'), 'rail stack rendered')
assert.ok(rail.includes('dshGlmRailItem t2'), '5h rail ring tier: cyan at 42.5%')
assert.ok(rail.includes('dshGlmRailItem t0'), '7d rail ring tier: bright green at 17.2%')
assert.equal((rail.match(/dshGlmRingFill/g) ?? []).length, 2, 'rail renders exactly two quota rings (5h + 7d)')
assert.ok(!rail.includes('dshGlmRailPct'), 'no percent digits beside the rings: the arc encodes the share')
assert.ok(rail.includes('5 小时窗口 43%'), 'hover/aria tooltip carries the exact 5h percent')
assert.ok(rail.includes('周额度 17%'), 'hover/aria tooltip carries the exact 7d percent')
assert.ok(rail.includes('1h30m'), '5h reset countdown under the ring')
assert.ok(rail.includes('3d0h'), '7d reset countdown under the ring')
assert.ok(!rail.includes('MCP'), 'rail form carries no MCP data')
assert.ok(!rail.includes('Pro'), 'rail form carries no plan level')
assert.ok(/stroke-dasharray="41\.39\d* 97\.38\d*"/.test(rail), '5h ring arc encodes its percent: ' + (rail.match(/stroke-dasharray="[^"]+"/) ?? [])[0])

// A plan without the weekly window renders no weekly row.
const noWeekly = { ...snap, data: { ...snap.data, windows: snap.data.windows.filter((w) => w.id !== '7d') } }
const wideNoWeekly = renderToString(React.createElement(registration.component, {
  wide: true,
  useQuota: hookOf(noWeekly),
  refresh: () => {},
}))
assert.ok(!wideNoWeekly.includes('周额度'), 'no weekly window: no weekly metric')
assert.ok(!wideNoWeekly.includes('3d0h 后重置'), 'no weekly window: no weekly countdown')
const railNoWeekly = renderToString(React.createElement(registration.component, {
  wide: false,
  useQuota: hookOf(noWeekly),
  refresh: () => {},
}))
assert.equal((railNoWeekly.match(/dshGlmRingFill/g) ?? []).length, 1, 'no weekly window: rail shows only the 5h ring')
assert.ok(!railNoWeekly.includes('3d0h'), 'no weekly window: no weekly countdown in rail')
// Details stay in the DOM for accessibility, while CSS keeps the popover out of layout until opened.
assert.ok(wideNoWeekly.includes('aria-expanded="false"'), 'compact trigger starts closed')
assert.ok(wideNoWeekly.includes('dsh-glm-quota-details'), 'compact trigger controls the detail popover')

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

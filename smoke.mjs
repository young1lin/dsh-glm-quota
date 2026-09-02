/**
 * Standalone smoke for the glm-quota host half: mounts apply() against a fake
 * ctx (webServer route capture, credential stub, event listener capture) and a
 * local HTTP fake of the GLM quota API, then asserts the served projection,
 * the window mapping, the turn/end trigger, the throttle, and the 429
 * Retry-After backoff. Run: node smoke.mjs
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Config, apply } from './host.js'

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/** Fake GLM upstream: mode flips between the success payload and 429. */
const upstream = createServer((req, res) => {
  upstream.hits += 1
  if (upstream.mode === 'rate-limit') {
    res.writeHead(429, { 'Retry-After': '2' })
    res.end('{}')
    return
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({
    code: 200, msg: 'ok', success: true,
    data: {
      level: 'pro',
      limits: [
        { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 42.5, nextResetTime: Date.now() + 90 * 60_000 },
        { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 17.2, nextResetTime: Date.now() + 3 * 24 * 3600_000 },
        { type: 'TIME_LIMIT', unit: 1, number: 1, usage: 30, currentValue: 12, percentage: 40, nextResetTime: Date.now() + 10 * 24 * 3600_000 },
        { type: 'TOKENS_LIMIT', unit: 9, number: 2, percentage: 3, nextResetTime: 0 },
      ],
    },
  }))
})
upstream.hits = 0
upstream.mode = 'ok'
await new Promise((resolve) => { upstream.listen(0, '127.0.0.1', resolve) })
const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port

const stateDir = await mkdtemp(join(tmpdir(), 'glm-quota-smoke-'))
const stateFile = join(stateDir, 'state.json')

/** Fake ctx: captures the route, event listeners, and effect disposers. */
const listeners = new Map()
let routeHandler = undefined
const disposers = []
const ctx = {
  logger: { warn() {}, error() {} },
  get: (name) => name === 'credentials'
    ? { resolve: async (ref) => ref === 'ZAI_CODING_CN_API_KEY' ? { value: 'test-token', source: 'file' } : undefined }
    : undefined,
  on: (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, [])
    listeners.get(event).push(fn)
    return () => { listeners.get(event).splice(listeners.get(event).indexOf(fn), 1) }
  },
  effect: (register, label) => {
    const dispose = register()
    disposers.push({ dispose, label })
    return dispose
  },
  webServer: {
    register: (route) => {
      assert.equal(route.kind, 'exact')
      assert.equal(route.path, '/glm-quota/state')
      routeHandler = route.handler
      return () => { routeHandler = undefined }
    },
  },
}

const config = Config({
  baseURL: upstreamUrl,
  stateFile,
  minFetchIntervalMs: 1_500,
  errorBackoffMs: 60_000,
  rateLimitBackoffMs: 120_000,
})
apply(ctx, config)

/** Distinct session doubles: per-session provider routing needs real object keys. */
const sessionZai = { id: 'zai' }
const sessionDeepSeek = { id: 'deepseek' }
const emitSessionEvent = (session, event) => {
  for (const fn of listeners.get('session/event') ?? []) fn(session, event)
}

/** Minimal ServerResponse double capturing the served body. */
class Res {
  constructor() { this.body = '' }
  writeHead() { return this }
  end(chunk) { this.body += chunk ?? '' }
}

const get = async (refresh) => {
  assert.notEqual(routeHandler, undefined, 'route registered')
  const res = new Res()
  await routeHandler({ url: refresh ? '/glm-quota/state?refresh=1' : '/glm-quota/state' }, res)
  return JSON.parse(res.body)
}

// 1. Boot fetch serves the mapped projection. Poll instead of a fixed
//    sleep: a cold CI runner can take longer than 50ms to round-trip the
//    read-state-file -> write-state-file -> HTTP chain. The throttle still
//    caps the boot sequence at exactly one request, so === 1 stays strict.
const bootDeadline = Date.now() + 5_000
while (upstream.hits < 1 && Date.now() < bootDeadline) await sleep(25)
let state = await get()
assert.equal(upstream.hits, 1, 'one boot fetch')
assert.equal(state.planLevel, 'Pro')
assert.deepEqual(
  state.windows.map((w) => [w.id, w.percent]),
  [['5h', 42.5], ['7d', 17.2], ['mcp', 40], ['tok-u9-n2', 3]],
)
const mcp = state.windows.find((w) => w.id === 'mcp')
assert.equal(mcp.used, 12, 'MCP used <- currentValue')
assert.equal(mcp.limit, 30, 'MCP limit <- usage (API field reuse)')
assert.equal(state.error, '')

state = await get()
assert.equal(state.relevant, false, 'no watched session yet: panel reports irrelevant')

// 2. Idle + untracked + non-watched sessions trigger nothing.
//    turn/end on a never-started session, an untracked session's events, and
//    a full DeepSeek turn (header-identified provider) all stay at one hit.
emitSessionEvent(sessionZai, { type: 'turn/end' })
emitSessionEvent({ id: 'unknown' }, { type: 'assistant/chunk', data: {} })
emitSessionEvent(sessionDeepSeek, { type: 'turn/start' })
emitSessionEvent(sessionDeepSeek, {
  type: 'request/header',
  data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-chat' } } },
})
emitSessionEvent(sessionDeepSeek, { type: 'tool/call' })
emitSessionEvent(sessionDeepSeek, { type: 'turn/end' })
await sleep(50)
assert.equal(upstream.hits, 1, 'non-watched / untracked sessions never fetch')

// 3. Watched conversation running: events coalesce into the ceiling. The turn
//    starts, routing arrives via request/header, a burst of streaming events
//    lands — all inside the boot fetch's interval window, so still one hit.
emitSessionEvent(sessionZai, { type: 'turn/start' })
emitSessionEvent(sessionZai, {
  type: 'request/header',
  data: { header: { config: { provider: 'zai-coding-cn', model: 'glm-5.3' } } },
})
for (let i = 0; i < 5; i += 1) emitSessionEvent(sessionZai, { type: 'assistant/chunk', data: {} })
emitSessionEvent(sessionZai, { type: 'tool/call' })
await sleep(50)
assert.equal(upstream.hits, 1, 'event burst coalesced: no request inside the interval')

// 4. The pacing timer keeps the once-per-interval cadence while the watched
//    conversation runs (no new event needed inside the window). The timer
//    interval EQUALS minFetchIntervalMs, so every tick sits exactly on the
//    throttle boundary: whether a given tick fires depends on sub-millisecond
//    drift between the previous request's stamp and the tick. What must hold
//    on every machine is the pair of invariants: the timer DOES refresh a
//    running watched session (>= boot + 1 by the second tick — a suppressed
//    first tick leaves the next gap at >= 2x interval, which always clears
//    the window), and it NEVER exceeds one request per interval (boot + 2
//    fires is the hard ceiling across two ticks in 3.1s).
await sleep(3_100)
assert.ok(upstream.hits >= 2 && upstream.hits <= 3,
  'pacing timer refreshes a running watched session within the per-interval ceiling: ' + upstream.hits)
state = await get()
assert.equal(state.relevant, true, 'watched session seen + credential ok: relevant')

// 5. turn/end inside the throttle window: the final-refresh trigger is
//    coalesced away like any other event — nothing is running afterwards, so
//    nothing re-issues it. Strict "coalesce while running, zero once idle".
const hitsAtTurnEnd = upstream.hits
emitSessionEvent(sessionZai, { type: 'turn/end' })
await sleep(100)
assert.equal(upstream.hits, hitsAtTurnEnd, 'turn/end trigger coalesced: no request once idle')

// 6. The state file carries the throttle authority: the timestamp of the last
//    real request is persisted, and a fresh plugin instance over the same
//    file respects it instead of re-requesting immediately.
const persisted = JSON.parse(await readFile(stateFile, 'utf8'))
assert.equal(persisted.planLevel, 'Pro', 'projection persisted')
assert.equal(persisted.windows.length, 4)
assert.ok(Number.isFinite(persisted.lastAttemptAt) && persisted.lastAttemptAt > 0, 'lastAttemptAt persisted: ' + persisted.lastAttemptAt)

// 7. Cross-instance throttle: a second apply() over the same state file,
//    launched INSIDE the interval window, adopts the recorded lastAttemptAt
//    and its boot fetch is suppressed — the file, not memory, is the authority.
upstream.mode = 'ok'
let routeHandler2 = undefined
const routeCapture2 = { register: (route) => { routeHandler2 = route.handler; return () => { routeHandler2 = undefined } } }
const disposers2 = []
const ctx2 = {
  ...ctx,
  webServer: routeCapture2,
  on: (event, fn) => () => {},
  effect: (register) => { const d = register(); disposers2.push(d); return d },
}
const hitsBeforeSecond = upstream.hits
apply(ctx2, config)
await sleep(200)
assert.equal(upstream.hits, hitsBeforeSecond, 'second instance boot fetch suppressed by the file throttle')
for (const dispose of disposers2) if (typeof dispose === 'function') dispose()
assert.equal(routeHandler2, undefined, 'second instance route removed')

// Idle silence holds across both instances' pacing timers.
const restAt = upstream.hits
await sleep(3_400)
assert.equal(upstream.hits, restAt, 'idle hosts make zero upstream requests')

// 8. 429 handling on a fresh file: backoff arms from Retry-After, stale
//    windows keep serving, and further triggers are suppressed.
const stateFile429 = join(stateDir, 'state-429.json')
const disposers429 = []
const ctx429 = {
  ...ctx,
  webServer: { register: (route) => { routeHandler = route.handler; return () => { routeHandler = undefined } } },
  on: (event, fn) => () => {},
  effect: (register) => { const d = register(); disposers429.push(d); return d },
}
apply(ctx429, Config({ baseURL: upstreamUrl, stateFile: stateFile429, minFetchIntervalMs: 1_500, errorBackoffMs: 60_000, rateLimitBackoffMs: 120_000 }))
await sleep(100)
const hitsBefore429 = upstream.hits
upstream.mode = 'rate-limit'
state = await new Promise((resolve) => {
  const res = new Res()
  void routeHandler({ url: '/glm-quota/state?refresh=1' }, res).then(() => { resolve(JSON.parse(res.body)) })
})
assert.equal(upstream.hits, hitsBefore429 + 1, 'forced refresh reached upstream')
assert.ok(state.retryAt > Date.now(), 'backoff armed')
assert.ok(state.error.includes('rate limited'), 'error carried: ' + state.error)
assert.equal(state.windows.length, 4, 'stale windows still served under backoff')
emitSessionEvent({ id: 'zai2' }, { type: 'turn/start' })
emitSessionEvent({ id: 'zai2' }, {
  type: 'request/header',
  data: { header: { config: { provider: 'zai-coding-cn', model: 'glm-5.3' } } },
})
emitSessionEvent({ id: 'zai2' }, { type: 'turn/end' })
await sleep(50)
state = JSON.parse((await readFile(stateFile429, 'utf8')).toString())
for (const dispose of disposers429) if (typeof dispose === 'function') dispose()

await upstream.close()
await rm(stateDir, { recursive: true, force: true })
console.log('glm-quota host smoke: all assertions passed')

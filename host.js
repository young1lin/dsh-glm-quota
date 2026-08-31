/**
 * glm-quota — host half: fetches the Zhipu/GLM Coding Plan quota monitor API,
 * caches the projection under ~/.agents/glm-quota/state.json, and serves it to
 * the Web sidebar panel at GET /glm-quota/state.
 *
 * Fetch pacing model: while ANY watched-provider conversation is running (a
 * turn between 'turn/start' and 'turn/end'), quota refreshes are scheduled —
 * but never per event. Every trigger (session events, the pacing timer,
 * GET ...?refresh=1) funnels through ONE throttle that coalesces them into
 * at most one upstream request per minFetchIntervalMs (default: once a
 * minute, the same key serving every trigger). When NO watched conversation
 * is running — everything idle, or only non-watched sessions (e.g. DeepSeek)
 * active — zero upstream requests are made. A watched conversation's
 * 'turn/end' fires one final refresh (the "how much did that cost" read).
 *
 * The throttle's authority is the state file: the timestamp of the last
 * REAL upstream request is persisted to ~/.agents/glm-quota/state.json
 * BEFORE the request goes out, and re-read on every fetch decision, so the
 * one-per-minute ceiling survives host restarts and holds across parallel
 * dsh processes sharing the same key. On HTTP 429 the Retry-After header
 * (when present) extends the backoff; the last successful projection keeps
 * being served meanwhile.
 *
 * Provider routing is tracked per session from 'request/header'
 * (config.provider) and 'assistant/message' (message.source.provider); both
 * Zhipu protocol endpoints (Anthropic-compatible and OpenAI-compatible)
 * share one provider id, so one watchProviders entry covers them.
 *
 * API contract mirrored from the reference Go monitor (quota_glm.go): the
 * token is sent raw (no "Bearer " prefix); Accept-Language and Content-Type
 * headers are required; the (type, unit, number) dispatch maps windows —
 * TOKENS_LIMIT unit=3 number=5 -> 5-hour rolling window, TOKENS_LIMIT unit=6
 * number=1 -> weekly quota (absent on plans that have none), TIME_LIMIT ->
 * MCP tool-call cap where the API reuses the "usage" field as the cap and
 * currentValue as the used count.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

/** Stable Cordis plugin name (informational; the entry id is the mount key). */
export const name = 'dsh-glm-quota'

/** Services required before the route can register. */
export const inject = ['webServer']

/** Route path the sidebar panel polls (exact route, outside the /api gateway fence). */
const ROUTE_PATH = '/glm-quota/state'

/** Single upstream request timeout: a slow API must never stall a turn or a poll. */
const FETCH_TIMEOUT_MS = 4_000

/** Cap on the parsed Retry-After so a hostile header cannot freeze the panel. */
const MAX_BACKOFF_MS = 30 * 60_000

/** Plugin config: credential reference, API base, throttle shape, and state file. */
export const Config = z.object({
  keyRef: z.string().default('ZAI_CODING_CN_API_KEY'),
  baseURL: z.string().default('https://open.bigmodel.cn'),
  /** Provider ids whose sessions drive refreshes (both Zhipu protocol endpoints share one id). */
  watchProviders: z.array(z.string()).default(['zai-coding-cn']),
  minFetchIntervalMs: z.natural().min(500).default(60_000),
  errorBackoffMs: z.natural().default(60_000),
  rateLimitBackoffMs: z.natural().default(120_000),
  stateFile: z.string().default(''),
})

/**
 * One display window served to the panel.
 * @typedef {object} QuotaWindow
 * @property {string} id - stable window id: '5h' | '7d' | 'mcp' | derived for unknown windows.
 * @property {string} label - short display label.
 * @property {number} percent - used percentage 0-100 as reported by the API.
 * @property {number} resetAt - unix-millis reset timestamp; 0 when the API reports none.
 * @property {number} [used] - used count (MCP window: tool calls).
 * @property {number} [limit] - cap count (MCP window: the API's reused "usage" field).
 */

/**
 * The served projection: what the panel renders, plus cache/backoff facts.
 * @typedef {object} QuotaState
 * @property {string} planLevel
 * @property {QuotaWindow[]} windows
 * @property {number} fetchedAt - unix-millis time of the last successful upstream fetch.
 * @property {number} retryAt - while > Date.now(), upstream fetches are suppressed (failure backoff).
 * @property {string} error - last failure message; empty while healthy.
 */

/**
 * Map one raw API limit row to a display window (the Go (type, unit, number)
 * dispatch). Unknown rows pass through with derived ids so new upstream
 * window kinds still render.
 * @param limit - one row of data.limits.
 * @returns the display window.
 */
function toWindow(limit) {
  const resetAt = limit.nextResetTime > 0 ? limit.nextResetTime : 0
  if (limit.type === 'TOKENS_LIMIT' && limit.unit === 3 && limit.number === 5) {
    return { id: '5h', label: '5h', percent: limit.percentage, resetAt }
  }
  if (limit.type === 'TOKENS_LIMIT' && limit.unit === 6 && limit.number === 1) {
    return { id: '7d', label: '7d', percent: limit.percentage, resetAt }
  }
  if (limit.type === 'TIME_LIMIT') {
    return {
      id: 'mcp', label: 'MCP', percent: limit.percentage, resetAt,
      used: limit.currentValue, limit: limit.usage,
    }
  }
  if (limit.type === 'TOKENS_LIMIT') {
    return { id: 'tok-u' + limit.unit + '-n' + limit.number, label: 'Tok(u' + limit.unit + ',n' + limit.number + ')', percent: limit.percentage, resetAt }
  }
  return { id: String(limit.type).toLowerCase(), label: String(limit.type).toLowerCase(), percent: limit.percentage, resetAt }
}

/** Title-case a plan level for display ("pro" -> "Pro"); empty stays empty. */
function planName(level) {
  const trimmed = String(level ?? '').trim()
  if (trimmed === '') return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/**
 * Parse a Retry-After header (integer seconds or HTTP-date) to a backoff
 * duration in milliseconds, clamped to [0, MAX_BACKOFF_MS].
 * @param value - raw header value.
 * @returns backoff duration in milliseconds.
 */
function retryAfterMs(value) {
  if (value === undefined || value === null) return 0
  const text = String(value).trim()
  const secs = Number.parseInt(text, 10)
  if (Number.isFinite(secs) && String(secs) === text) {
    return Math.min(Math.max(secs, 0) * 1_000, MAX_BACKOFF_MS)
  }
  const when = Date.parse(text)
  if (Number.isFinite(when)) {
    return Math.min(Math.max(when - Date.now(), 0), MAX_BACKOFF_MS)
  }
  return 0
}

/** The empty projection served before any successful fetch. */
function emptyState() {
  return { planLevel: '', windows: [], fetchedAt: 0, retryAt: 0, error: '' }
}

/**
 * Mount the quota host half: state cache (memory + ~/.agents file), the
 * throttled fetch, the turn-end and periodic triggers, and the HTTP route.
 * @param ctx - plugin context carrying webServer (credentials via ctx.get).
 * @param config - validated Config.
 */
export function apply(ctx, config) {
  const stateFile = config.stateFile !== ''
    ? config.stateFile
    : join(homedir(), '.agents', 'glm-quota', 'state.json')

  /** Current served projection (superseded by a newer state file on read). */
  let state = emptyState()
  /** In-flight upstream fetch, so concurrent triggers share one request. */
  let pending = undefined
  /** Unix-millis time of the last upstream request attempt (success or not). */
  let lastAttemptAt = 0

  /**
   * Adopt the state file's projection when it is newer than memory: another
   * process (a headless dsh run on the same machine) may have refreshed it.
   * @returns the file's state when adoptable, else undefined.
   */
  const readStateFile = async () => {
    try {
      const raw = JSON.parse(await readFile(stateFile, 'utf8'))
      if (raw === null || typeof raw !== 'object') return undefined
      // The file is the throttle's cross-process authority: another dsh
      // process may have issued a real request after our last one. Adopt its
      // newer attempt timestamp so the one-per-interval ceiling holds across
      // processes sharing the same key.
      const fileLastAttempt = Number(raw.lastAttemptAt) || 0
      if (fileLastAttempt > lastAttemptAt) lastAttemptAt = fileLastAttempt
      if (Number(raw.fetchedAt) > state.fetchedAt && Array.isArray(raw.windows)) {
        state = {
          planLevel: String(raw.planLevel ?? ''),
          windows: raw.windows,
          fetchedAt: Number(raw.fetchedAt) || 0,
          retryAt: Number(raw.retryAt) || 0,
          error: String(raw.error ?? ''),
        }
      }
    } catch {
      // Absent or unreadable state file: nothing to adopt.
    }
    return undefined
  }

  /**
   * Persist the projection and the throttle authority. lastAttemptAt rides
   * along every write; a failed write only costs a cold next start or a
   * re-issued request, the served projection is unaffected.
   */
  const writeStateFile = async () => {
    try {
      await mkdir(dirname(stateFile), { recursive: true })
      const tmp = join(dirname(stateFile), '.state.json.tmp-' + process.pid)
      await writeFile(tmp, JSON.stringify({ ...state, lastAttemptAt }), 'utf8')
      await rename(tmp, stateFile)
    } catch (error) {
      ctx.logger.warn('dsh-glm-quota: state file write failed: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  /**
   * Fetch the quota monitor API once and fold the result into the state.
   * Single-flight. The throttle decision (backoff + minimum interval) runs
   * INSIDE the flight against the file-backed lastAttemptAt, and the real
   * request timestamp is persisted before the request goes out — so
   * concurrent triggers, host restarts, and parallel processes all land on
   * the same one-request-per-interval ceiling.
   * @returns a promise settling when the attempt (or the throttle skip) is done.
   */
  const fetchUpstream = (force = false) => {
    if (pending !== undefined) return pending
    pending = (async () => {
      await readStateFile()
      const now = Date.now()
      if (state.retryAt > now) return
      if (!force && now - lastAttemptAt < config.minFetchIntervalMs) return
      // Record the real request before issuing it: the file is what another
      // process (or a restarted host) reads to keep the ceiling honest.
      lastAttemptAt = now
      await writeStateFile()
      const credentials = ctx.get('credentials')
      if (credentials === undefined) {
        state = { ...state, error: 'credentials service unavailable' }
        return
      }
      let token
      try {
        const hit = await credentials.resolve(credentialRef(config.keyRef))
        token = hit === undefined ? undefined : hit.value
      } catch (error) {
        state = { ...state, error: 'credential resolve failed: ' + (error instanceof Error ? error.message : String(error)) }
        return
      }
      if (token === undefined || token === '') {
        // A missing credential is a configuration gap, not an API failure:
        // no backoff, so the next trigger re-checks immediately after a fix.
        credentialOk = false
        state = { ...state, error: 'credential ' + config.keyRef + ' not configured' }
        return
      }
      credentialOk = true
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const response = await fetch(config.baseURL + '/api/monitor/usage/quota/limit', {
          signal: controller.signal,
          headers: {
            Authorization: token,
            'Accept-Language': 'en-US,en',
            'Content-Type': 'application/json',
          },
        })
        if (response.status === 429) {
          const backoff = Math.max(retryAfterMs(response.headers.get('Retry-After')), config.rateLimitBackoffMs)
          state = { ...state, retryAt: Date.now() + backoff, error: 'rate limited; retry in ' + Math.round(backoff / 1000) + 's' }
          await writeStateFile()
          return
        }
        if (!response.ok) {
          state = { ...state, retryAt: Date.now() + config.errorBackoffMs, error: 'HTTP ' + response.status }
          await writeStateFile()
          return
        }
        const body = await response.json()
        if (body === null || typeof body !== 'object' || body.success !== true) {
          const info = body !== null && typeof body === 'object' ? ' (code=' + String(body.code) + ' msg=' + String(body.msg) + ')' : ''
          state = { ...state, retryAt: Date.now() + config.errorBackoffMs, error: 'api success=false' + info }
          await writeStateFile()
          return
        }
        const data = body.data === null || typeof body.data !== 'object' ? {} : body.data
        const limits = Array.isArray(data.limits) ? data.limits : []
        state = {
          planLevel: planName(data.level),
          windows: limits.map(toWindow),
          fetchedAt: Date.now(),
          retryAt: 0,
          error: '',
        }
        await writeStateFile()
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError'
        state = {
          ...state,
          retryAt: Date.now() + config.errorBackoffMs,
          error: aborted ? 'upstream timeout' : error instanceof Error ? error.message : String(error),
        }
        await writeStateFile()
      } finally {
        clearTimeout(timeout)
      }
    })().finally(() => { pending = undefined })
    return pending
  }

  // Seed memory from the state file, then fetch once so a freshly opened GUI
  // shows current numbers (unless another process fetched moments ago).
  void readStateFile().then(() => { void fetchUpstream() })

  // Per-session routing + running state: which provider each conversation's
  // requests actually go to, and whether a turn is currently executing.
  // Provider facts arrive on 'request/header' (config.provider, logged on the
  // first request and on every config change) and 'assistant/message'
  // (message.source.provider, on every completed step); running is the
  // turn/start..turn/end bracket. A plain Map (not WeakMap) because the idle
  // check must enumerate entries; 'session/disposed' removes them.
  const sessions = new Map()

  /** Extract a provider id from a session event that carries one, else undefined. */
  const providerOf = (event) => {
    if (event === null || typeof event !== 'object') return undefined
    if (event.type === 'request/header') {
      const config = event.data?.header?.config
      return typeof config?.provider === 'string' ? config.provider : undefined
    }
    if (event.type === 'assistant/message') {
      const provider = event.data?.message?.source?.provider
      return typeof provider === 'string' ? provider : undefined
    }
    return undefined
  }

  /** Whether a provider id routes to the watched Zhipu endpoints. */
  const isWatched = (provider) => provider !== undefined && config.watchProviders.includes(provider)

  /** Whether any watched-provider conversation is mid-turn right now. */
  const hasActiveWatched = () => {
    for (const entry of sessions.values()) {
      if (entry.running && isWatched(entry.provider)) return true
    }
    return false
  }

  /**
   * Whether quota concerns THIS host at all: a watched-provider session has
   * been seen AND the credential resolves. A host whose conversations all go
   * elsewhere (no baseURL of the watched provider in use) serves
   * relevant:false and the panel removes itself from the sidebar — no dead
   * UI on machines that never talk to Zhipu.
   */
  let watchedEverSeen = false
  let credentialOk = false
  const isRelevant = () => watchedEverSeen && credentialOk

  // The activity -> fetch map: every event of a RUNNING watched conversation
  // schedules a fetch (throttled to once per interval inside fetchUpstream),
  // so a busy conversation refreshes continuously but never faster than the
  // ceiling. Non-watched or idle conversations schedule nothing.
  ctx.on('session/event', (session, event) => {
    if (event === null || typeof event !== 'object') return
    let entry = sessions.get(session)
    if (entry === undefined) {
      entry = { provider: undefined, running: false }
      sessions.set(session, entry)
    }
    const provider = providerOf(event)
    if (provider !== undefined) entry.provider = provider
    if (isWatched(provider)) watchedEverSeen = true
    if (event.type === 'turn/start') {
      entry.running = true
      return
    }
    if (event.type === 'turn/end') {
      // Final "what did that cost" refresh for a watched conversation, then
      // the session rests: no further fetches until its next turn starts.
      const wasActiveWatched = entry.running && isWatched(entry.provider)
      entry.running = false
      if (wasActiveWatched) void fetchUpstream()
      return
    }
    if (entry.running && isWatched(entry.provider)) void fetchUpstream()
  })

  ctx.on('session/disposed', (session) => { sessions.delete(session) })

  // Pacing timer: while a watched conversation runs, guarantee the
  // once-per-interval cadence even when no event arrives inside a window
  // (e.g. one long tool call between events). With nothing watched running,
  // the tick is a pure in-memory check — zero upstream requests.
  const timer = setInterval(() => {
    if (hasActiveWatched()) void fetchUpstream()
  }, config.minFetchIntervalMs)
  timer.unref?.()

  // A credential update re-arms the throttle immediately (no backoff, no
  // min-interval memory of the pre-rotation failures).
  ctx.on('credentials/updated', (ref) => {
    if (ref === config.keyRef) {
      lastAttemptAt = 0
      state = { ...state, retryAt: 0 }
      void fetchUpstream()
    }
  })

  /** Bumped when host.js semantics change; lets a probe tell which module version is live. */
  const MODULE_REV = 'relevance-1'

  const serve = (res) => {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-glm-quota-rev': MODULE_REV,
    })
    res.end(JSON.stringify({ ...state, relevant: isRelevant() }))
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      const force = new URL(req.url ?? '/', 'http://x').searchParams.get('refresh') === '1'
      await readStateFile()
      if (force) await fetchUpstream(true)
      serve(res)
    },
  }), 'dsh-glm-quota: GET /glm-quota/state')

  ctx.effect(() => () => { clearInterval(timer) }, 'dsh-glm-quota: pacing timer')
}

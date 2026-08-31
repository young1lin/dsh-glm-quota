/*
 * glm-quota — client bundle (browser half). Registers the GLM quota panel
 * into the sidebar footer action slot (rendered above Settings). The panel
 * polls the host half's GET /glm-quota/state endpoint; all quota semantics
 * (window mapping, throttle, backoff) live host-side.
 *
 * Bundle format: a single window.__ModuleLoader__.load handoff; every
 * cross-package value arrives through the injected require (the loader module
 * table). Percent colors follow the reference monitor's five tiers:
 * <20 bright green, <40 green, <60 cyan, <80 yellow, >=80 red.
 */

window.__ModuleLoader__.load({
  id: 'dsh-glm-quota',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const { useEffect, useState } = React
    const { Tooltip, IconChevronDownOutline14 } = require('@deepseek-ai/dsh-client-ui-primitives')

    const ENDPOINT = '/glm-quota/state'
    const POLL_MS = 30_000

    const css = [
      '.dshGlm{width:100%;box-sizing:border-box;padding:8px 10px 4px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dshGlm.rail{width:36px;height:36px;margin:8px 0 10px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;border:none;transition:background .15s}',
      '.dshGlm.rail:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshGlmHead{display:flex;align-items:center;gap:6px;margin:0 0 9px}',
      '.dshGlmBrand{display:flex;align-items:center;gap:6px;min-width:0;flex:1}',
      '.dshGlmTitle{font-weight:600;letter-spacing:.4px;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.dshGlmPlan{flex:none;padding:0 7px;border-radius:999px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:17px;font-weight:500}',
      '.dshGlmRefresh{flex:none;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1;cursor:pointer;transition:transform .6s cubic-bezier(.22,1,.36,1),background .15s,color .15s}',
      '.dshGlmRefresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshGlmRefresh:active{background:var(--dsw-alias-interactive-bg-active)}',
      '.dshGlmRefreshIcon{display:inline-flex;transform-origin:50% 50%}',
      '.dshGlmRefreshIcon.spin{animation:dshGlmSpin .8s linear infinite}',
      '@keyframes dshGlmSpin{to{transform:rotate(360deg)}}',
      '.dshGlmNext{display:flex;align-items:center;gap:5px;margin:3px 0 2px;color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshGlmRow{display:grid;grid-template-columns:36px 1fr 52px;align-items:center;gap:9px;margin:0;padding:2px 2px}',
      '.dshGlmLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}',
      '.dshGlmTrack{position:relative;height:8px;box-sizing:border-box;border-radius:999px;background:var(--dsw-alias-fill-l2);border:1px solid var(--dsw-alias-border-l2);overflow:hidden}',
      '.dshGlmFill{position:absolute;top:0;bottom:0;left:0;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,currentColor 72%,transparent),currentColor);box-shadow:0 0 8px color-mix(in srgb,currentColor 45%,transparent);transition:width .6s cubic-bezier(.22,1,.36,1)}',
      '.dshGlmValue,.dshGlmCount{text-align:right;font-family:var(--dsh-font-mono);font-size:11px;font-variant-numeric:tabular-nums}',
      '.dshGlmDim{color:var(--dsw-alias-label-tertiary)}',
      '.dshGlmCollapse{flex:none;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:background .15s,color .15s}',
      '.dshGlmCollapse:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshGlmCollapseIcon{display:inline-flex;transform-origin:50% 50%;transition:transform .2s ease}',
      '.dshGlmCollapsed .dshGlmCollapseIcon{transform:rotate(-90deg)}',
      '.dshGlmCollapsed .dshGlmBody{display:none}',
      '.dshGlmWarn{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}',
      '.dshGlmSvg{transform:rotate(-90deg)}',
      '.dshGlmRingTrack{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:5}',
      '.dshGlmRingFill{fill:none;stroke:currentColor;stroke-width:5;stroke-linecap:round;transition:stroke-dasharray .6s cubic-bezier(.22,1,.36,1)}',
      '.dshGlmRow.t0,.dshGlm.rail.t0{color:var(--dsw-static-green-400)}',
      '.dshGlmRow.t1,.dshGlm.rail.t1{color:var(--dsw-static-green-500)}',
      '.dshGlmRow.t2,.dshGlm.rail.t2{color:#0891b2}',
      '.dshGlmRow.t3,.dshGlm.rail.t3{color:#b45309}',
      '.dshGlmRow.t4,.dshGlm.rail.t4{color:var(--dsw-static-red-500)}',
      'body[data-ds-dark-theme] .dshGlmRow.t0,body[data-ds-dark-theme] .dshGlm.rail.t0{color:#30d158}',
      'body[data-ds-dark-theme] .dshGlmRow.t1,body[data-ds-dark-theme] .dshGlm.rail.t1{color:#32d74b}',
      'body[data-ds-dark-theme] .dshGlmRow.t2,body[data-ds-dark-theme] .dshGlm.rail.t2{color:#22d3ee}',
      'body[data-ds-dark-theme] .dshGlmRow.t3,body[data-ds-dark-theme] .dshGlm.rail.t3{color:#ffb020}',
      'body[data-ds-dark-theme] .dshGlmRow.t4,body[data-ds-dark-theme] .dshGlm.rail.t4{color:#ff5d5d}',
      '@media (prefers-reduced-motion:reduce){.dshGlmFill,.dshGlmRingFill,.dshGlmRefresh{transition:none}.dshGlmRefreshIcon.spin{animation-duration:2s}}',
    ].join('')
    const cssTag = 'dsh-glm-quota/styles.css'
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css=' + JSON.stringify(cssTag) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-glm-quota'
      tag.dataset.pluginCss = cssTag
      tag.textContent = css
      document.head.appendChild(tag)
    }

    /** Usage tier class t0..t4 (bright green, green, cyan, yellow, red). */
    function tierOf(percent) {
      if (percent >= 80) return 't4'
      if (percent >= 60) return 't3'
      if (percent >= 40) return 't2'
      if (percent >= 20) return 't1'
      return 't0'
    }

    /** Compact countdown: <1m / Xm / XhYm / XdYh; '' when unknown. */
    function countdown(resetAt, now) {
      if (resetAt === undefined || resetAt <= 0) return ''
      const diff = resetAt - now
      if (diff <= 0) return '即将刷新'
      const totalSec = Math.floor(diff / 1000)
      if (totalSec < 60) return '<1m'
      const hours = Math.floor(totalSec / 3600)
      const mins = Math.floor(totalSec / 60) % 60
      if (hours >= 24) return Math.floor(hours / 24) + 'd' + (hours % 24) + 'h'
      if (hours >= 1) return hours + 'h' + mins + 'm'
      return mins + 'm'
    }

    /** Absolute local time: HH:mm today, else M/d HH:mm. */
    function absoluteTime(resetAt, now) {
      const when = new Date(resetAt)
      const sameDay = new Date(now).toDateString() === when.toDateString()
      const hm = String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0')
      return sameDay ? hm : (when.getMonth() + 1) + '/' + when.getDate() + ' ' + hm
    }

    /** Compact count: 517 / 4k / 1.2M. */
    function compactCount(n) {
      const abs = Math.abs(n)
      if (abs < 1000) return String(n)
      if (abs < 1000000) return (n % 1000 === 0 ? n / 1000 : Math.round(n / 100) / 10) + 'k'
      return (n % 1000000 === 0 ? n / 1000000 : Math.round(n / 100000) / 10) + 'M'
    }

    /** Ring circumference for the rail form's 36-unit viewBox (r = 15.5). */
    const RING_C = 2 * Math.PI * 15.5

    /** Persisted collapsed preference (localStorage; survives refresh and HMR). */
    const COLLAPSED_KEY = 'glm-quota.collapsed'
    const readCollapsed = () => {
      try { return globalThis.localStorage?.getItem(COLLAPSED_KEY) === '1' } catch { return false }
    }

    /** One window row: label + tier-colored bar + value (percent or counts). */
    function WindowRow({ label, window: w, now }) {
      const pct = Math.max(0, Math.min(100, w.percent))
      const tier = tierOf(pct)
      const titleBits = ['已用 ' + Math.round(pct) + '%']
      if (w.resetAt > 0) {
        titleBits.push('重置于 ' + absoluteTime(w.resetAt, now) + '（剩 ' + countdown(w.resetAt, now) + '）')
      }
      const isCount = w.id === 'mcp' && w.used !== undefined && w.limit !== undefined
      if (isCount) titleBits.unshift('已用 ' + compactCount(w.used) + ' / ' + compactCount(w.limit) + ' 次')
      return React.createElement('div', {
        className: 'dshGlmRow ' + tier,
        title: titleBits.join(' · '),
      },
        React.createElement('span', { className: 'dshGlmLabel' }, label),
        React.createElement('span', { className: 'dshGlmTrack' },
          React.createElement('span', {
            className: 'dshGlmFill',
            style: { width: Math.round(pct) + '%' },
          })),
        React.createElement('span', { className: isCount ? 'dshGlmCount' : 'dshGlmValue' },
          isCount ? compactCount(w.used) + '/' + compactCount(w.limit) : Math.round(pct) + '%'))
    }

    /**
     * The sidebar-foot quota panel. Props arrive as the slot's composed
     * shares: the owner's wide flag, the hooks-bound useQuota selector, and
     * the injected refresh callback.
     */
    function QuotaPanel({ wide, useQuota, refresh }) {
      const snapshot = useQuota((s) => s)
      const [now, setNow] = useState(() => Date.now())
      // Refresh in flight: drives the icon spin (on until the forced fetch settles).
      const [spinning, setSpinning] = useState(false)
      // Collapsed preference: persisted in localStorage, survives refresh/HMR.
      const [collapsed, setCollapsed] = useState(readCollapsed)
      const toggleCollapsed = () => {
        setCollapsed((prev) => {
          const next = !prev
          try { globalThis.localStorage?.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* storage unavailable: session-only collapse */ }
          return next
        })
      }
      useEffect(() => {
        const timer = setInterval(() => { setNow(Date.now()) }, 30_000)
        return () => { clearInterval(timer) }
      }, [])

      // Irrelevant host (no watched-provider session, or credential absent):
      // remove the panel from the sidebar entirely — no dead UI on machines
      // that never talk to Zhipu. Only decided on a real projection; loading
      // and transport errors keep the current display.
      if (snapshot.phase === 'ready' && snapshot.data.relevant === false) return null

      if (snapshot.phase === 'loading') {
        return wide
          ? React.createElement('div', { className: 'dshGlm dshGlmDim' }, 'GLM 额度…')
          : React.createElement('div', { className: 'dshGlm rail dshGlmDim' }, '…')
      }
      if (snapshot.phase === 'error') {
        const label = 'GLM 额度不可用：' + snapshot.message
        return wide
          ? React.createElement('div', { className: 'dshGlm dshGlmDim', title: label }, 'GLM 额度不可用')
          : React.createElement('div', { className: 'dshGlm rail dshGlmDim', title: label, onClick: refresh, role: 'button' }, '?')
      }

      const data = snapshot.data
      const windows = data.windows
      const fiveHour = windows.find((w) => w.id === '5h')
      const weekly = windows.find((w) => w.id === '7d')
      const mcp = windows.find((w) => w.id === 'mcp')
      const extras = windows.filter((w) => w.id !== '5h' && w.id !== '7d' && w.id !== 'mcp')
      const worst = windows.reduce((acc, w) => Math.max(acc, w.percent), 0)
      const worstTier = tierOf(worst)
      const summary = 'GLM' + (data.planLevel !== '' ? ' · ' + data.planLevel : '') + ' — '
        + windows.map((w) => (w.id === 'mcp' && w.used !== undefined && w.limit !== undefined
          ? 'MCP ' + compactCount(w.used) + '/' + compactCount(w.limit)
          : w.label + ' ' + Math.round(w.percent) + '%')).join(' · ')
        + (snapshot.stale === true ? '（获取失败，显示上次数据）' : '')

      if (!wide) {
        // Zero usage still draws a small fixed arc: with none, a round-linecap
        // dot at 0% is nearly invisible and the control reads as empty space.
        const ringPct = worst <= 0 ? 4 : Math.max(0, Math.min(100, worst))
        return React.createElement(Tooltip, { label: summary, delayMs: 300 },
          React.createElement('div', {
            className: 'dshGlm rail ' + worstTier,
            onClick: refresh,
            role: 'button',
            'aria-label': summary,
          },
            React.createElement('svg', {
              className: 'dshGlmSvg', width: 22, height: 22, viewBox: '0 0 36 36', 'aria-hidden': true,
            },
              React.createElement('circle', { className: 'dshGlmRingTrack', cx: 18, cy: 18, r: 15.5 }),
              React.createElement('circle', {
                className: 'dshGlmRingFill', cx: 18, cy: 18, r: 15.5,
                strokeDasharray: (RING_C * ringPct / 100) + ' ' + RING_C,
              }))))
      }

      // Per-window reset listing: every window's refresh countdown stays
      // visible (a weekly reset would otherwise hide behind the 5h one in a
      // nearest-only line); absolute times go in the tooltip.
      const shortLabel = (w) => (w.id === '5h' ? '5h' : w.id === '7d' ? '周限' : w.id === 'mcp' ? 'MCP' : w.label)
      const resettable = windows.filter((w) => w.resetAt > 0)
      const resetLine = resettable
        .map((w) => shortLabel(w) + ' 剩' + countdown(w.resetAt, now))
        .join(' · ')
      const resetTip = resettable
        .map((w) => shortLabel(w) + '：重置于 ' + absoluteTime(w.resetAt, now))
        .join('\n')

      const rows = []
      if (fiveHour !== undefined) rows.push(React.createElement(WindowRow, { key: '5h', label: '5小时', window: fiveHour, now }))
      if (weekly !== undefined) rows.push(React.createElement(WindowRow, { key: '7d', label: '周限', window: weekly, now }))
      if (mcp !== undefined) rows.push(React.createElement(WindowRow, { key: 'mcp', label: 'MCP', window: mcp, now }))
      for (const w of extras) rows.push(React.createElement(WindowRow, { key: w.id, label: w.label, window: w, now }))

      return React.createElement('div', { className: 'dshGlm' + (collapsed ? ' dshGlmCollapsed' : '') },
        React.createElement('div', { className: 'dshGlmHead' },
          React.createElement('span', { className: 'dshGlmBrand' },
            React.createElement('span', { className: 'dshGlmTitle' }, 'GLM'),
            data.planLevel !== ''
              ? React.createElement('span', { className: 'dshGlmPlan' }, data.planLevel)
              : null),
          snapshot.stale === true && !collapsed
            ? React.createElement('span', {
              className: 'dshGlmWarn',
              title: '额度获取失败，正在显示上次成功数据',
            }, '!')
            : null,
          collapsed ? null : React.createElement('button', {
            type: 'button',
            className: 'dshGlmRefresh',
            title: '立即刷新额度',
            'aria-label': spinning ? '正在刷新额度' : '立即刷新额度',
            onClick: () => {
              if (spinning) return
              setSpinning(true)
              Promise.resolve(refresh()).finally(() => { setSpinning(false) })
            },
          },
            React.createElement('span', {
              className: 'dshGlmRefreshIcon' + (spinning ? ' spin' : ''),
              'aria-hidden': true,
            }, '↻')),
          React.createElement('button', {
            type: 'button',
            className: 'dshGlmCollapse',
            title: collapsed ? '展开额度面板' : '收起额度面板',
            'aria-label': collapsed ? '展开额度面板' : '收起额度面板',
            'aria-expanded': collapsed ? 'false' : 'true',
            onClick: toggleCollapsed,
          },
            React.createElement(IconChevronDownOutline14, {
              size: 14,
              className: 'dshGlmCollapseIcon',
            }))),
        React.createElement('div', { className: 'dshGlmBody' },
          rows.length > 0 ? rows : React.createElement('div', { className: 'dshGlmDim' }, '暂无额度窗口数据'),
          resetLine !== ''
            ? React.createElement('div', {
              className: 'dshGlmNext',
              title: resetTip,
            }, '↻ ' + resetLine)
            : null))
    }

    // --- quota source: poll the host endpoint into a bare observable -------
    let snapshot = { phase: 'loading' }
    const listeners = new Set()
    let lastData = undefined
    /** In-flight poll promise; lets the refresh control spin until settle. */
    let polling = undefined

    const source = {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    }

    const publish = (next) => {
      snapshot = next
      for (const listener of listeners) listener()
    }

    const poll = (force) => {
      if (polling !== undefined) return polling
      polling = (async () => {
      let next
      try {
        const response = await fetch(force === true ? ENDPOINT + '?refresh=1' : ENDPOINT, { cache: 'no-store' })
        if (!response.ok) throw new Error('HTTP ' + response.status)
        const data = await response.json()
        if (data === null || typeof data !== 'object' || !Array.isArray(data.windows)) {
          throw new Error('unexpected payload')
        }
        lastData = data
        next = { phase: 'ready', data }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        next = lastData !== undefined
          ? { phase: 'ready', data: lastData, stale: true, note: message }
          : { phase: 'error', message }
      }
      publish(next)
      })().finally(() => { polling = undefined })
      return polling
    }

    /** Required services: the slot registry the panel registers into. */
    exports.inject = ['slots']

    /**
     * Client plugin body: start the endpoint poll (page-visible cadence) and
     * register the panel above Settings in the sidebar foot.
     * @param ctx - client root context.
     */
    exports.apply = function apply(ctx) {
      ctx.effect(() => {
        void poll(false)
        const timer = setInterval(() => {
          if (document.visibilityState !== 'hidden') void poll(false)
        }, POLL_MS)
        const onVisibility = () => {
          if (document.visibilityState === 'visible') void poll(false)
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, 'dsh-glm-quota: quota poll')

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'dsh-glm-quota',
        order: 10,
        inject: () => ({
          hooks: { quota: source },
          refresh: () => poll(true),
        }),
      }, QuotaPanel))
    }

    return module.exports
  },
})

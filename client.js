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
  id: '@young1lin/dsh-glm-quota',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const { useEffect, useRef, useState } = React
    const { Tooltip, IconChevronDownOutline14, IconRefreshOutline14 } = require('@deepseek-ai/dsh-client-ui-primitives')

    const ENDPOINT = '/glm-quota/state'
    const POLL_MS = 30_000

    const css = [
      '.dshGlm{position:relative;width:100%;box-sizing:border-box;margin:4px 0 7px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dshGlmOpen{z-index:40}',
      '.dshGlmCompact{box-sizing:border-box;width:100%;height:42px;display:flex;align-items:center;gap:7px;padding:0 10px 0 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgb(0 0 0 / 3%);color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:left;transition:background .15s,border-color .15s}',
      '.dshGlmCompact:hover{background:var(--dsw-alias-button-floating-hover);border-color:var(--dsw-alias-border-l2)}',
      '.dshGlmCompact:focus-visible,.dshGlmAction:focus-visible,.dshGlm.rail:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
      '.dshGlmBrand{display:flex;align-items:baseline;gap:6px;min-width:0;flex:1}',
      '.dshGlmTitle{font-size:13px;line-height:18px;font-weight:650;letter-spacing:.02em;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.dshGlmPlan{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-weight:500}',
      '.dshGlmPlan:before{content:"·";margin-right:6px;color:var(--dsw-alias-label-dimmed)}',
      '.dshGlmCompactValue{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;font-weight:600;font-variant-numeric:tabular-nums}',
      '.dshGlmCompactRing{flex:none;width:22px;height:22px;transform:rotate(-90deg)}',
      '.dshGlmChevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary);transition:transform .2s ease}',
      '.dshGlmOpen .dshGlmChevron{transform:rotate(180deg)}',
      '.dshGlmPopover{display:none;position:absolute;left:0;right:0;bottom:calc(100% + 8px);box-sizing:border-box;max-height:min(360px,calc(100vh - 120px));overflow-y:auto;padding:10px 12px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3)}',
      '.dshGlmOpen .dshGlmPopover{display:block;animation:dshGlmPopoverIn .16s cubic-bezier(.22,1,.36,1)}',
      '@keyframes dshGlmPopoverIn{from{opacity:0;transform:translateY(4px)}}',
      '.dshGlmPopoverHead{display:flex;align-items:center;gap:6px;min-height:26px;padding:0 0 5px 3px}',
      '.dshGlmPopoverTitle{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-weight:600}',
      '.dshGlmAction{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:background .15s,color .15s}',
      '.dshGlmAction:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshGlmRefreshIcon{display:inline-flex;transform-origin:50% 50%}',
      '.dshGlmRefreshIcon.spin{animation:dshGlmSpin .8s linear infinite}',
      '@keyframes dshGlmSpin{to{transform:rotate(360deg)}}',
      '.dshGlmMetrics{display:flex;flex-direction:column}',
      '.dshGlmMetric{--dsh-glm-accent:var(--dsw-static-green-400);box-sizing:border-box;min-width:0;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px 3px}',
      '.dshGlmMetric+.dshGlmMetric{border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dshGlmGauge{width:28px;height:28px;color:var(--dsh-glm-accent);transform:rotate(-90deg)}',
      '.dshGlmMetricCopy{min-width:0}',
      '.dshGlmLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;font-weight:550}',
      '.dshGlmMeta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px;font-variant-numeric:tabular-nums}',
      '.dshGlmValue{flex:none;color:var(--dsw-alias-label-primary);font-size:15px;line-height:20px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
      '.dshGlmValue.count{font-size:13px;letter-spacing:-.01em}',
      '.dshGlmValueLimit{color:var(--dsw-alias-label-tertiary);font-size:.85em;font-weight:500}',
      '.dshGlmEmpty{padding:10px 4px;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:center}',
      '.dshGlmDim{color:var(--dsw-alias-label-tertiary)}',
      '.dshGlmWarn{flex:none;width:6px;height:6px;border-radius:50%;background:#ff9f0a;box-shadow:0 0 0 2px color-mix(in srgb,#ff9f0a 18%,transparent)}',
      '.dshGlm.rail{width:36px;height:36px;margin:8px 0 10px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;border:none;transition:background .15s}',
      '.dshGlm.rail:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshGlmRail{width:36px;margin:8px 0 10px;display:flex;flex-direction:column;align-items:center;gap:6px}',
      '.dshGlmRailItem{display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px 2px;border:none;border-radius:12px;background:transparent;cursor:pointer;transition:background .15s}',
      '.dshGlmRailItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshGlmRailItem:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
      '.dshGlmRailCd{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:12px;font-weight:500;font-variant-numeric:tabular-nums}',
      '.dshGlmSvg{transform:rotate(-90deg)}',
      '.dshGlmRingTrack{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:5}',
      '.dshGlmRingFill{fill:none;stroke:currentColor;stroke-width:5;stroke-linecap:round;transition:stroke-dasharray .6s cubic-bezier(.22,1,.36,1)}',
      '.dshGlmMetric.t0{--dsh-glm-accent:var(--dsw-static-green-400)}',
      '.dshGlmMetric.t1{--dsh-glm-accent:var(--dsw-static-green-500)}',
      '.dshGlmMetric.t2{--dsh-glm-accent:#0891b2}',
      '.dshGlmMetric.t3{--dsh-glm-accent:#b45309}',
      '.dshGlmMetric.t4{--dsh-glm-accent:var(--dsw-static-red-500)}',
      '.dshGlmCompactRing.t0,.dshGlm.rail.t0{color:var(--dsw-static-green-400)}',
      '.dshGlmCompactRing.t1,.dshGlm.rail.t1{color:var(--dsw-static-green-500)}',
      '.dshGlmCompactRing.t2,.dshGlm.rail.t2{color:#0891b2}',
      '.dshGlmCompactRing.t3,.dshGlm.rail.t3{color:#b45309}',
      '.dshGlmCompactRing.t4,.dshGlm.rail.t4{color:var(--dsw-static-red-500)}',
      '.dshGlmRailItem.t0 .dshGlmSvg{color:var(--dsw-static-green-400)}',
      '.dshGlmRailItem.t1 .dshGlmSvg{color:var(--dsw-static-green-500)}',
      '.dshGlmRailItem.t2 .dshGlmSvg{color:#0891b2}',
      '.dshGlmRailItem.t3 .dshGlmSvg{color:#b45309}',
      '.dshGlmRailItem.t4 .dshGlmSvg{color:var(--dsw-static-red-500)}',
      'body[data-ds-dark-theme] .dshGlmCompact,body[data-ds-dark-theme] .dshGlmPopover{box-shadow:0 4px 18px rgb(0 0 0 / 24%)}',
      'body[data-ds-dark-theme] .dshGlmMetric.t0,body[data-ds-dark-theme] .dshGlmCompactRing.t0,body[data-ds-dark-theme] .dshGlm.rail.t0{--dsh-glm-accent:#30d158;color:#30d158}',
      'body[data-ds-dark-theme] .dshGlmMetric.t1,body[data-ds-dark-theme] .dshGlmCompactRing.t1,body[data-ds-dark-theme] .dshGlm.rail.t1{--dsh-glm-accent:#32d74b;color:#32d74b}',
      'body[data-ds-dark-theme] .dshGlmMetric.t2,body[data-ds-dark-theme] .dshGlmCompactRing.t2,body[data-ds-dark-theme] .dshGlm.rail.t2{--dsh-glm-accent:#22d3ee;color:#22d3ee}',
      'body[data-ds-dark-theme] .dshGlmMetric.t3,body[data-ds-dark-theme] .dshGlmCompactRing.t3,body[data-ds-dark-theme] .dshGlm.rail.t3{--dsh-glm-accent:#ffb020;color:#ffb020}',
      'body[data-ds-dark-theme] .dshGlmMetric.t4,body[data-ds-dark-theme] .dshGlmCompactRing.t4,body[data-ds-dark-theme] .dshGlm.rail.t4{--dsh-glm-accent:#ff5d5d;color:#ff5d5d}',
      'body[data-ds-dark-theme] .dshGlmRailItem.t0 .dshGlmSvg{color:#30d158}',
      'body[data-ds-dark-theme] .dshGlmRailItem.t1 .dshGlmSvg{color:#32d74b}',
      'body[data-ds-dark-theme] .dshGlmRailItem.t2 .dshGlmSvg{color:#22d3ee}',
      'body[data-ds-dark-theme] .dshGlmRailItem.t3 .dshGlmSvg{color:#ffb020}',
      'body[data-ds-dark-theme] .dshGlmRailItem.t4 .dshGlmSvg{color:#ff5d5d}',
      '@media (prefers-reduced-motion:reduce){.dshGlmPopover,.dshGlmRingFill,.dshGlmAction,.dshGlmChevron{transition:none;animation:none}.dshGlmRefreshIcon.spin{animation-duration:2s}}',
    ].join('')
    const cssTag = '@young1lin/dsh-glm-quota/styles.css'
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css=' + JSON.stringify(cssTag) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = '@young1lin/dsh-glm-quota'
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

    /** One quota metric: a quiet circular gauge plus label, reset, and exact value. */
    function QuotaMetric({ label, window: w, now }) {
      const pct = Math.max(0, Math.min(100, w.percent))
      const tier = tierOf(pct)
      const ringPct = pct <= 0 ? 4 : pct
      const isCount = w.id === 'mcp' && w.used !== undefined && w.limit !== undefined
      const titleBits = [label + '已用 ' + Math.round(pct) + '%']
      if (isCount) titleBits.unshift('已用 ' + compactCount(w.used) + ' / ' + compactCount(w.limit) + ' 次')
      if (w.resetAt > 0) {
        titleBits.push('重置于 ' + absoluteTime(w.resetAt, now) + '（剩 ' + countdown(w.resetAt, now) + '）')
      }
      const meta = (isCount ? Math.round(pct) + '% 已用' : '')
        + (isCount && w.resetAt > 0 ? ' · ' : '')
        + (w.resetAt > 0 ? countdown(w.resetAt, now) + ' 后重置' : '')
      return React.createElement('div', {
        className: 'dshGlmMetric ' + tier,
        title: titleBits.join(' · '),
      },
        React.createElement('svg', {
          className: 'dshGlmGauge', width: 28, height: 28, viewBox: '0 0 36 36',
          role: 'img', 'aria-label': label + '已用 ' + Math.round(pct) + '%',
        },
          React.createElement('circle', { className: 'dshGlmRingTrack', cx: 18, cy: 18, r: 15.5 }),
          React.createElement('circle', {
            className: 'dshGlmRingFill', cx: 18, cy: 18, r: 15.5,
            strokeDasharray: (RING_C * ringPct / 100) + ' ' + RING_C,
          })),
        React.createElement('div', { className: 'dshGlmMetricCopy' },
          React.createElement('div', { className: 'dshGlmLabel' }, label),
          meta === '' ? null : React.createElement('div', { className: 'dshGlmMeta' }, meta)),
        isCount
          ? React.createElement('span', { className: 'dshGlmValue count' },
            compactCount(w.used),
            React.createElement('span', { className: 'dshGlmValueLimit' }, ' / ' + compactCount(w.limit)))
          : React.createElement('span', { className: 'dshGlmValue' }, Math.round(pct) + '%'))
    }

    /** Display label for a rail item: friendly for the known ids, raw otherwise. */
    function railLabel(w) {
      if (w.id === '5h') return '5 小时窗口'
      if (w.id === '7d') return '周额度'
      return w.label
    }

    /**
     * Narrow-rail quota item: tier-colored ring whose arc encodes the used
     * share, reset countdown under it. Pure quota — no plan name, no MCP
     * counts, no digits inside the ring (tooltip carries the exact percent).
     */
    function QuotaRailItem({ label, window: w, now, refresh, stale }) {
      const pct = Math.max(0, Math.min(100, w.percent))
      const tier = tierOf(pct)
      const ringPct = pct <= 0 ? 4 : pct
      const left = countdown(w.resetAt, now)
      const title = label + ' ' + Math.round(pct) + '%'
        + (left !== '' ? '，剩 ' + left + ' 刷新' : '')
        + (w.resetAt > 0 ? '（' + absoluteTime(w.resetAt, now) + '）' : '')
        + (stale ? '（获取失败，显示上次数据）' : '')
      return React.createElement(Tooltip, { label: title, delayMs: 300 },
        React.createElement('button', {
          type: 'button', className: 'dshGlmRailItem ' + tier,
          onClick: refresh, 'aria-label': title,
        },
          React.createElement('svg', {
            className: 'dshGlmSvg', width: 30, height: 30, viewBox: '0 0 36 36', 'aria-hidden': true,
          },
            React.createElement('circle', { className: 'dshGlmRingTrack', cx: 18, cy: 18, r: 15.5 }),
            React.createElement('circle', {
              className: 'dshGlmRingFill', cx: 18, cy: 18, r: 15.5,
              strokeDasharray: (RING_C * ringPct / 100) + ' ' + RING_C,
            })),
          left !== '' ? React.createElement('span', { className: 'dshGlmRailCd' }, left) : null))
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
      // Details are transient: the sidebar keeps only one 42px status row in layout.
      const [open, setOpen] = useState(false)
      const rootRef = useRef(null)
      useEffect(() => {
        const timer = setInterval(() => { setNow(Date.now()) }, 30_000)
        return () => { clearInterval(timer) }
      }, [])
      useEffect(() => {
        if (!open) return undefined
        const closeOutside = (event) => {
          if (rootRef.current?.contains(event.target) !== true) setOpen(false)
        }
        const closeOnKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        const closeOnDrag = () => { setOpen(false) }
        document.addEventListener('pointerdown', closeOutside)
        document.addEventListener('keydown', closeOnKey)
        document.addEventListener('dragstart', closeOnDrag)
        return () => {
          document.removeEventListener('pointerdown', closeOutside)
          document.removeEventListener('keydown', closeOnKey)
          document.removeEventListener('dragstart', closeOnDrag)
        }
      }, [open])
      useEffect(() => { if (!wide) setOpen(false) }, [wide])

      // Irrelevant host (no watched-provider session, or credential absent):
      // remove the panel from the sidebar entirely — no dead UI on machines
      // that never talk to Zhipu. Only decided on a real projection; loading
      // and transport errors keep the current display.
      if (snapshot.phase === 'ready' && snapshot.data.relevant === false) return null

      if (snapshot.phase === 'loading') {
        return wide
          ? React.createElement('div', { className: 'dshGlm' },
            React.createElement('div', { className: 'dshGlmCompact dshGlmDim' }, 'GLM 额度…'))
          : React.createElement('div', { className: 'dshGlm rail dshGlmDim' }, '…')
      }
      if (snapshot.phase === 'error') {
        const label = 'GLM 额度不可用：' + snapshot.message
        return wide
          ? React.createElement('div', { className: 'dshGlm' },
            React.createElement('button', {
              type: 'button', className: 'dshGlmCompact dshGlmDim', title: label, onClick: refresh,
            }, 'GLM 额度不可用'))
          : React.createElement('button', {
            type: 'button', className: 'dshGlm rail dshGlmDim', title: label, onClick: refresh,
          }, '?')
      }

      const data = snapshot.data
      const windows = data.windows
      const fiveHour = windows.find((w) => w.id === '5h')
      const weekly = windows.find((w) => w.id === '7d')
      const mcp = windows.find((w) => w.id === 'mcp')
      const extras = windows.filter((w) => w.id !== '5h' && w.id !== '7d' && w.id !== 'mcp')
      // Headline number = the worst TOKEN-quota window (5h, 7d, unknown
      // token windows). MCP is a call-count cap, not token quota: a 95% MCP
      // bar must not mask a nearly untouched 5h window. When two token
      // windows disagree (7d 10% over 5h 5%) the closer-to-limit one leads —
      // the headline reads "distance to the nearest token ceiling". MCP-only
      // data falls back to MCP so the row never goes blank.
      const quotaWindows = windows.filter((w) => w.id !== 'mcp')
      const worstPool = quotaWindows.length > 0 ? quotaWindows : windows
      const worst = worstPool.reduce((acc, w) => Math.max(acc, w.percent), 0)
      const worstTier = tierOf(worst)
      const summary = 'GLM' + (data.planLevel !== '' ? ' · ' + data.planLevel : '') + ' — '
        + windows.map((w) => (w.id === 'mcp' && w.used !== undefined && w.limit !== undefined
          ? 'MCP ' + compactCount(w.used) + '/' + compactCount(w.limit)
          : w.label + ' ' + Math.round(w.percent) + '%')).join(' · ')
        + (snapshot.stale === true ? '（获取失败，显示上次数据）' : '')

      // Zero usage still draws a small fixed arc: with none, a round-linecap
      // dot at 0% is nearly invisible and the control reads as empty space.
      const ringPct = worst <= 0 ? 4 : Math.max(0, Math.min(100, worst))
      if (!wide) {
        // Pure quota per window: the 5h ring (percent inside, reset countdown
        // under it) and, when the plan has a weekly limit, the 7d ring below.
        // No plan name, no MCP counts, no blended worst-window ring.
        const railWindows = windows.filter((w) => w.id !== 'mcp')
        if (railWindows.length > 0) {
          return React.createElement('div', { className: 'dshGlmRail' },
            railWindows.map((w) => React.createElement(QuotaRailItem, {
              key: w.id, label: railLabel(w), window: w, now,
              refresh, stale: snapshot.stale === true,
            })))
        }
        // No quota windows at all (only MCP or nothing yet): keep the old
        // single worst-window ring so the control never disappears.
        return React.createElement(Tooltip, { label: summary, delayMs: 300 },
          React.createElement('button', {
            type: 'button', className: 'dshGlm rail ' + worstTier,
            onClick: refresh, 'aria-label': summary,
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

      const metrics = []
      if (fiveHour !== undefined) metrics.push(React.createElement(QuotaMetric, { key: '5h', label: '5 小时', window: fiveHour, now }))
      if (weekly !== undefined) metrics.push(React.createElement(QuotaMetric, { key: '7d', label: '周额度', window: weekly, now }))
      if (mcp !== undefined) metrics.push(React.createElement(QuotaMetric, { key: 'mcp', label: 'MCP 调用', window: mcp, now }))
      for (const w of extras) metrics.push(React.createElement(QuotaMetric, { key: w.id, label: w.label, window: w, now }))

      // The workspace tree is the sidebar's only scroll host. Native drag
      // auto-scroll stops when the pointer enters a footer sibling, so this
      // compact row extends the bottom edge and keeps reordering fluid.
      const scrollWorkspaceOnDrag = (event) => {
        event.preventDefault()
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
        setOpen(false)
        const tree = document.querySelector('[role="tree"]')
        if (tree !== null && typeof tree.scrollTop === 'number') tree.scrollTop += 28
      }

      return React.createElement('div', {
        ref: rootRef,
        className: 'dshGlm ' + worstTier + (open ? ' dshGlmOpen' : ''),
        onDragOver: scrollWorkspaceOnDrag,
      },
        React.createElement('div', {
          id: 'dsh-glm-quota-details',
          className: 'dshGlmPopover',
          role: 'dialog',
          'aria-label': 'GLM 额度详情',
        },
          React.createElement('div', { className: 'dshGlmPopoverHead' },
            React.createElement('span', { className: 'dshGlmPopoverTitle' }, 'Coding Plan 额度'),
            snapshot.stale === true
              ? React.createElement('span', {
                className: 'dshGlmWarn', title: '额度获取失败，正在显示上次成功数据',
                'aria-label': '额度数据可能已过期',
              })
              : null,
            React.createElement('button', {
              type: 'button', className: 'dshGlmAction', title: '立即刷新额度',
              'aria-label': spinning ? '正在刷新额度' : '立即刷新额度',
              onClick: () => {
                if (spinning) return
                setSpinning(true)
                Promise.resolve(refresh()).finally(() => { setSpinning(false) })
              },
            }, React.createElement(IconRefreshOutline14, {
              size: 14, className: 'dshGlmRefreshIcon' + (spinning ? ' spin' : ''),
            }))),
          metrics.length > 0
            ? React.createElement('div', { className: 'dshGlmMetrics' }, metrics)
            : React.createElement('div', { className: 'dshGlmEmpty' }, '暂无额度窗口数据')),
        React.createElement('button', {
          type: 'button',
          className: 'dshGlmCompact',
          title: open ? '收起额度详情' : summary,
          'aria-label': (open ? '收起' : '展开') + ' GLM 额度详情。' + summary,
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': 'dsh-glm-quota-details',
          onClick: () => { setOpen((value) => !value) },
        },
          React.createElement('span', { className: 'dshGlmBrand' },
            React.createElement('span', { className: 'dshGlmTitle' }, 'GLM'),
            data.planLevel !== '' ? React.createElement('span', { className: 'dshGlmPlan' }, data.planLevel) : null),
          snapshot.stale === true ? React.createElement('span', { className: 'dshGlmWarn', 'aria-hidden': true }) : null,
          React.createElement('span', { className: 'dshGlmCompactValue' }, Math.round(worst) + '%'),
          React.createElement('svg', {
            className: 'dshGlmCompactRing ' + worstTier,
            width: 22, height: 22, viewBox: '0 0 36 36', 'aria-hidden': true,
          },
            React.createElement('circle', { className: 'dshGlmRingTrack', cx: 18, cy: 18, r: 15.5 }),
            React.createElement('circle', {
              className: 'dshGlmRingFill', cx: 18, cy: 18, r: 15.5,
              strokeDasharray: (RING_C * ringPct / 100) + ' ' + RING_C,
            })),
          React.createElement(IconChevronDownOutline14, { size: 14, className: 'dshGlmChevron' })))
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

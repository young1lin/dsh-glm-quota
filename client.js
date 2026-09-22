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
      '.dshGlmCompact{box-sizing:border-box;width:100%;height:42px;display:flex;align-items:center;gap:7px;padding:0 10px 0 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:21px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgb(0 0 0 / 3%);color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:left;transition:background .15s,border-color .15s}',
      '.dshGlmCompact:hover{background:var(--dsw-alias-button-floating-hover);border-color:var(--dsw-alias-border-l2)}',
      '.dshGlmCompact:focus-visible,.dshGlmAction:focus-visible,.dshGlm.rail:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
      '.dshGlmBrand{display:flex;align-items:baseline;gap:6px;min-width:0;flex:1}',
      '.dshGlmTitle{font-size:13px;line-height:18px;font-weight:650;letter-spacing:.02em;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.dshGlmPlan{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-weight:500}',
      '.dshGlmPlan:before{content:"·";margin-right:6px;color:var(--dsw-alias-label-dimmed)}',
      '.dshGlmCompactValue{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;font-weight:600;font-variant-numeric:tabular-nums}',
      '.dshGlmChevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary);transition:transform .2s ease}',
      '.dshGlmOpen .dshGlmChevron{transform:rotate(180deg)}',
      '.dshGlmPopover{display:none;position:absolute;left:0;right:0;bottom:calc(100% + 8px);box-sizing:border-box;max-height:min(360px,calc(100vh - 120px));overflow-y:auto;padding:10px 12px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3)}',
      '.dshGlmOpen .dshGlmPopover{display:block;animation:dshGlmPopoverIn .16s cubic-bezier(.22,1,.36,1)}',
      '@keyframes dshGlmPopoverIn{from{opacity:0;transform:translateY(4px)}}',
      '.dshGlmPopoverHead{display:flex;align-items:center;gap:6px;min-height:26px;padding:0 0 5px 3px}',
      '.dshGlmPopoverTitle{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-weight:600}',
      '.dshGlmAction{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:background .15s,color .15s}',
      '.dshGlmAction:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshGlmRefreshIcon{display:inline-flex;transform-origin:50% 50%}',
      '.dshGlmRefreshIcon.spin{animation:dshGlmSpin .8s linear infinite}',
      '@keyframes dshGlmSpin{to{transform:rotate(360deg)}}',
      '.dshGlmMetrics{display:flex;flex-direction:column}',
      '.dshGlmMetric{box-sizing:border-box;min-width:0;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px 3px}',
      '.dshGlmMetric+.dshGlmMetric{border-top:1px solid var(--dsw-alias-border-l1)}',
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
      '.dshGlmRail{width:48px;margin:8px 0 10px;display:flex;flex-direction:column;align-items:center;gap:6px}',
      '.dshGlmRailItem{box-sizing:border-box;width:48px;height:48px;display:flex;align-items:center;justify-content:center;padding:1px;border:none;border-radius:50%;background:transparent;cursor:pointer;transition:background .15s;user-select:none}',
      '.dshGlmRailItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshGlmRailItem:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
      // --dsh-glm-track paints the unused share. --dsw-alias-border-l2 is a
      // hairline token: at ring scale it reads as a thin stroke rather than a
      // gauge track, which is why a lightly used ring looked empty or broken.
      // Deepen it with the tertiary label color so it still follows the theme.
      '.dshGlmRing{--dsh-glm-accent:var(--dsw-static-green-400);--dsh-glm-track:color-mix(in srgb,var(--dsw-alias-label-tertiary) 30%,var(--dsw-alias-border-l2));--dsh-glm-groove:5px;position:relative;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;flex:none;border-radius:50%;background:conic-gradient(from -90deg,var(--dsh-glm-accent) var(--dsh-glm-pct),var(--dsh-glm-track) 0);box-shadow:inset 0 2px 3px rgb(0 0 0 / 18%),inset 0 -1px 1px rgb(255 255 255 / 75%),0 1px 1px rgb(255 255 255 / 70%)}',
      '.dshGlmRing:before{content:"";position:absolute;inset:var(--dsh-glm-groove);border-radius:50%;background:var(--dsw-alias-bg-layer-1);box-shadow:0 0 0 1px rgb(255 255 255 / 70%),0 2px 3px rgb(0 0 0 / 18%),inset 0 1px 1px rgb(255 255 255 / 65%)}',
      '.dshGlmRing.dshGlmGauge:before{background:var(--dsw-specific-menu)}',
      // The host theme smooths every corner app-wide via
      // `*,:before,:after{corner-shape:superellipse(1.5)}`. On any
      // border-radius:50% box those four superellipse arcs bulge outward
      // instead of closing into a circle, so the quota rings render as
      // squircles. Re-own the corner geometry of everything this plugin
      // draws as a circle or a full-round capsule (a class selector
      // outranks the universal rule); low-radius surfaces like the
      // popover keep the host's continuous corners.
      '.dshGlmRing,.dshGlmRing:before,.dshGlmWarn,.dshGlmAction,.dshGlm.rail,.dshGlmRailItem,.dshGlmCompact{corner-shape:round}',
      // Ring size variants: the base .dshGlmRing rule above paints the
      // 46px rail ring. These modifiers used to sit BEFORE it at equal
      // specificity, so the later 46px base won and every ring rendered
      // rail-sized — overflowing the 42px capsule and covering detail
      // labels. Doubling the class keeps the override order-independent.
      // Material scales with the control. The three-layer groove reads as a
      // bevel at 46px, but at 22px those highlights only blur the edge into
      // grey haze, so the smallest ring keeps one inset shadow and a hairline.
      '.dshGlmRing.dshGlmCompactRing{width:22px;height:22px;--dsh-glm-groove:3px;box-shadow:inset 0 1px 2px rgb(0 0 0 / 15%)}',
      '.dshGlmRing.dshGlmCompactRing:before{box-shadow:0 0 0 1px rgb(255 255 255 / 55%)}',
      '.dshGlmRing.dshGlmGauge{width:28px;height:28px;--dsh-glm-groove:4px}',
      '.dshGlmRailCd{position:relative;z-index:1;color:var(--dsw-alias-label-primary);font-size:12px;line-height:1;font-weight:650;letter-spacing:-.04em;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dshGlmRailCd.mid{font-size:10.5px}',
      '.dshGlmRailCd.long{font-size:9px}',
      '.dshGlmRing.t0{--dsh-glm-accent:var(--dsw-static-green-400)}',
      '.dshGlmRing.t1{--dsh-glm-accent:var(--dsw-static-green-500)}',
      '.dshGlmRing.t2{--dsh-glm-accent:#0891b2}',
      '.dshGlmRing.t3{--dsh-glm-accent:#b45309}',
      '.dshGlmRing.t4{--dsh-glm-accent:var(--dsw-static-red-500)}',
      'body[data-ds-dark-theme] .dshGlmCompact,body[data-ds-dark-theme] .dshGlmPopover{box-shadow:0 4px 18px rgb(0 0 0 / 24%)}',
      'body[data-ds-dark-theme] .dshGlmRing{box-shadow:inset 0 2px 3px rgb(0 0 0 / 55%),inset 0 -1px 1px rgb(255 255 255 / 12%),0 1px 1px rgb(255 255 255 / 8%)}',
      'body[data-ds-dark-theme] .dshGlmRing:before{box-shadow:0 0 0 1px rgb(255 255 255 / 10%),0 2px 3px rgb(0 0 0 / 55%),inset 0 1px 1px rgb(255 255 255 / 10%)}',
      'body[data-ds-dark-theme] .dshGlmRing{--dsh-glm-track:color-mix(in srgb,var(--dsw-alias-label-tertiary) 38%,var(--dsw-alias-border-l2))}',
      'body[data-ds-dark-theme] .dshGlmRing.dshGlmCompactRing{box-shadow:inset 0 1px 2px rgb(0 0 0 / 50%)}',
      'body[data-ds-dark-theme] .dshGlmRing.dshGlmCompactRing:before{box-shadow:0 0 0 1px rgb(255 255 255 / 9%)}',
      'body[data-ds-dark-theme] .dshGlmRing.t0{--dsh-glm-accent:#30d158}',
      'body[data-ds-dark-theme] .dshGlmRing.t1{--dsh-glm-accent:#32d74b}',
      'body[data-ds-dark-theme] .dshGlmRing.t2{--dsh-glm-accent:#22d3ee}',
      'body[data-ds-dark-theme] .dshGlmRing.t3{--dsh-glm-accent:#ffb020}',
      'body[data-ds-dark-theme] .dshGlmRing.t4{--dsh-glm-accent:#ff5d5d}',
      '@media (prefers-reduced-motion:reduce){.dshGlmPopover,.dshGlmAction,.dshGlmChevron,.dshGlmRailItem,.dshGlm.rail{transition:none;animation:none}.dshGlmRefreshIcon.spin{animation-duration:2s}}',
    ].join('')
    const cssTag = '@young1lin/dsh-glm-quota/styles.css'
    if (typeof document !== 'undefined' && document.head !== undefined && document.head !== null) {
      // HMR re-executes this factory in place. Create the tag once, then
      // always sync its text: a rebuilt bundle must never keep stale styles
      // (a create-once guard leaves new DOM rendering with old CSS).
      let tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(cssTag) + ']')
      if (tag === null) {
        tag = document.createElement('style')
        tag.dataset.plugin = '@young1lin/dsh-glm-quota'
        tag.dataset.pluginCss = cssTag
        document.head.appendChild(tag)
      }
      if (tag.textContent !== css) tag.textContent = css
    }

    /** Usage tier class t0..t4 (bright green, green, cyan, yellow, red). */
    function tierOf(percent) {
      if (percent >= 80) return 't4'
      if (percent >= 60) return 't3'
      if (percent >= 40) return 't2'
      if (percent >= 20) return 't1'
      return 't0'
    }

    /**
     * Compact countdown to a reset, returned as data rather than a display
     * string: seconds under one minute, then minutes/hours/days. "known"
     * false means the host reported no reset time; "expired" means the stamp
     * passed and the next projection has not landed yet.
     *
     * Callers must branch on these flags, never on "text" — keying render
     * logic off a Chinese literal breaks silently the moment the copy moves.
     *
     * A zero trailing unit is dropped ("1d", not "1d0h"): it carries no
     * information, and the extra characters pushed short countdowns into the
     * shrunken center-label font for nothing.
     */
    function countdownOf(resetAt, now) {
      if (resetAt === undefined || resetAt <= 0) return { known: false, expired: false, text: '' }
      const diff = resetAt - now
      if (diff <= 0) return { known: true, expired: true, text: '0s' }
      const totalSec = Math.ceil(diff / 1000)
      const live = (text) => ({ known: true, expired: false, text })
      if (totalSec < 60) return live(totalSec + 's')
      const hours = Math.floor(totalSec / 3600)
      const mins = Math.floor(totalSec / 60) % 60
      const pair = (big, bigUnit, small, smallUnit) =>
        big + bigUnit + (small > 0 ? small + smallUnit : '')
      if (hours >= 24) return live(pair(Math.floor(hours / 24), 'd', hours % 24, 'h'))
      if (hours >= 1) return live(pair(hours, 'h', mins, 'm'))
      return live(mins + 'm')
    }

    /** Absolute local time: HH:mm today, else M/d HH:mm. */
    function absoluteTime(resetAt, now) {
      const when = new Date(resetAt)
      const sameDay = new Date(now).toDateString() === when.toDateString()
      const hm = String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0')
      return sameDay ? hm : (when.getMonth() + 1) + '/' + when.getDate() + ' ' + hm
    }

    /**
     * Compact count: 517 / 4k / 1.2M. Rounds to one decimal BEFORE choosing
     * the unit; picking the unit first rendered 999,999 as "1000k".
     */
    function compactCount(n) {
      if (Math.abs(n) < 1000) return String(n)
      const thousands = Math.round(n / 100) / 10
      if (Math.abs(thousands) < 1000) return thousands + 'k'
      return Math.round(n / 100000) / 10 + 'M'
    }

    /**
     * Center-label size step. One extra character must not halve the type:
     * the old 3-or-fewer/otherwise split made the countdown grow when it
     * ticked from 1h0m to 59m, so the number visibly jumped every hour.
     */
    function countdownSize(text) {
      if (text.length >= 5) return ' long'
      if (text.length === 4) return ' mid'
      return ''
    }

    /** One recessed ring style, scaled for the rail, detail, and trigger. */
    function QuotaRing({ percent, tier, className, label, countdownText }) {
      const pct = Math.max(0, Math.min(100, percent))
      // A 1% share is a 3.6 degree arc — invisible on a 3-5px groove, so a
      // barely touched window rendered as a dead empty circle. Give any
      // non-zero share a floor of 4% of the circumference (~2px of arc).
      // A true 0% still draws nothing: the spec forbids a false starting
      // segment, and the exact figure stays in the digits and the accessible
      // name either way.
      const arc = pct > 0 ? Math.max(pct, 4) : 0
      const text = countdownText === undefined ? '' : countdownText
      return React.createElement('span', {
        className: 'dshGlmRing ' + tier + (className ? ' ' + className : ''),
        style: { '--dsh-glm-pct': arc + '%' },
        role: label ? 'img' : undefined,
        'aria-label': label,
        'aria-hidden': label ? undefined : true,
      }, text === ''
        ? null
        : React.createElement('span', {
          className: 'dshGlmRailCd' + countdownSize(text),
          'aria-hidden': true,
        }, text))
    }

    /** One quota metric: a quiet circular gauge plus label, reset, and exact value. */
    function QuotaMetric({ label, window: w, now }) {
      const pct = Math.max(0, Math.min(100, pctOf(w)))
      const tier = tierOf(pct)
      const isCount = w.id === 'mcp' && w.used !== undefined && w.limit !== undefined
      const cd = countdownOf(w.resetAt, now)
      const titleBits = [label + '已用 ' + Math.round(pct) + '%']
      if (isCount) titleBits.unshift('已用 ' + compactCount(w.used) + ' / ' + compactCount(w.limit) + ' 次')
      if (cd.known) {
        titleBits.push('重置于 ' + absoluteTime(w.resetAt, now)
          + (cd.expired ? '（即将刷新）' : '（剩 ' + cd.text + '）'))
      }
      // The ring encodes the used share and the right-hand column carries the
      // exact figure, so the meta line no longer repeats the percentage — on
      // the MCP row that was the same number a third time. Expired reads as a
      // sentence of its own: the old concatenation produced the nonsense
      // "即将刷新 后重置".
      const meta = !cd.known ? '' : cd.expired ? '即将刷新' : cd.text + ' 后重置'
      return React.createElement('div', {
        className: 'dshGlmMetric ' + tier,
        title: titleBits.join(' · '),
      },
        React.createElement(QuotaRing, {
          percent: pct, tier, className: 'dshGlmGauge',
          label: label + '已用 ' + Math.round(pct) + '%',
        }),
        React.createElement('div', { className: 'dshGlmMetricCopy' },
          React.createElement('div', { className: 'dshGlmLabel' }, label),
          meta === '' ? null : React.createElement('div', { className: 'dshGlmMeta' }, meta)),
        isCount
          ? React.createElement('span', { className: 'dshGlmValue count' },
            compactCount(w.used),
            React.createElement('span', { className: 'dshGlmValueLimit' }, ' / ' + compactCount(w.limit)))
          : React.createElement('span', { className: 'dshGlmValue' }, Math.round(pct) + '%'))
    }

    /** Finite percent of a window: non-numeric upstream data reads as 0, never NaN. */
    function pctOf(w) {
      return Number.isFinite(w.percent) ? w.percent : 0
    }

    /** Whether a window is a token-quota window (drives headline + rail). */
    function isTokenWindow(w) {
      return w.id === '5h' || w.id === '7d' || String(w.id).startsWith('tok-')
    }

    /** Display label for a rail item: friendly for the known ids, raw otherwise. */
    function railLabel(w) {
      if (w.id === '5h') return '5 小时窗口'
      if (w.id === '7d') return '周额度'
      return w.label
    }

    /**
     * Narrow-rail quota item: tier-colored ring whose arc encodes the used
     * share, reset countdown in its center. Precise percent stays in tooltip.
     */
    function QuotaRailItem({ label, window: w, now, refresh, stale }) {
      const pct = Math.max(0, Math.min(100, pctOf(w)))
      const tier = tierOf(pct)
      const cd = countdownOf(w.resetAt, now)
      const title = label + ' ' + Math.round(pct) + '%'
        + (!cd.known ? '' : cd.expired ? '，即将重置' : '，剩 ' + cd.text + ' 重置')
        + (cd.known ? '（' + absoluteTime(w.resetAt, now) + '）' : '')
        + (stale ? '（获取失败，显示上次数据）' : '')
      return React.createElement(Tooltip, { label: title, delayMs: 300 },
        React.createElement('button', {
          type: 'button', className: 'dshGlmRailItem ' + tier,
          onClick: refresh, 'aria-label': title,
        },
          React.createElement(QuotaRing, { percent: pct, tier, countdownText: cd.text })))
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
      const secondsVisible = snapshot.phase === 'ready' && snapshot.data.windows.some((w) =>
        w.resetAt > now && w.resetAt - now <= 60_000)
      useEffect(() => {
        const timer = setInterval(() => { setNow(Date.now()) }, secondsVisible ? 1_000 : 30_000)
        return () => { clearInterval(timer) }
      }, [secondsVisible])
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
      const quotaWindows = windows.filter(isTokenWindow)
      const worstPool = quotaWindows.length > 0 ? quotaWindows : windows
      const worst = worstPool.reduce((acc, w) => Math.max(acc, pctOf(w)), 0)
      const worstTier = tierOf(worst)
      const summary = 'GLM' + (data.planLevel !== '' ? ' · ' + data.planLevel : '') + ' — '
        + windows.map((w) => (w.id === 'mcp' && w.used !== undefined && w.limit !== undefined
          ? 'MCP ' + compactCount(w.used) + '/' + compactCount(w.limit)
          : w.label + ' ' + Math.round(pctOf(w)) + '%')).join(' · ')
        + (snapshot.stale === true ? '（获取失败，显示上次数据）' : '')

      if (!wide) {
        // Pure quota per token window: the 5h ring, the 7d ring below when
        // the plan has a weekly limit, unknown token windows after. The arc
        // encodes the share, the reset countdown sits inside it. No plan
        // name, no MCP, no percent digits, no blended worst-window ring.
        const railWindows = windows.filter(isTokenWindow)
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
            React.createElement(QuotaRing, {
              percent: worst, tier: worstTier, className: 'dshGlmCompactRing',
            })))
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
          // Not role="dialog": this disclosure never receives focus and traps
          // none, and announcing a dialog that focus never reaches strands
          // screen-reader users inside it. The trigger's aria-expanded and
          // aria-controls already carry the relationship; "group" keeps the
          // element labelable.
          role: 'group',
          'aria-label': 'GLM 额度详情',
        },
          React.createElement('div', { className: 'dshGlmPopoverHead' },
            // The plan tier is data the host already projects (planLevel, from
            // the upstream data.level). A constant title threw it away and left
            // the popover unable to say which plan these numbers belong to.
            React.createElement('span', { className: 'dshGlmPopoverTitle' },
              'Coding Plan' + (data.planLevel !== '' ? ' · ' + data.planLevel : '') + ' 额度'),
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
          React.createElement(QuotaRing, {
            percent: worst, tier: worstTier, className: 'dshGlmCompactRing',
          }),
          React.createElement(IconChevronDownOutline14, { size: 14, className: 'dshGlmChevron' })))
    }

    // --- quota source: poll the host endpoint into a bare observable -------
    let snapshot = { phase: 'loading' }
    const listeners = new Set()
    let lastData = undefined
    /** In-flight poll promise; lets the refresh control spin until settle. */
    let polling = undefined
    /** Whether the in-flight poll carries ?refresh=1. */
    let pollingForced = false
    /** A forced refresh queued behind a plain poll already in flight. */
    let queuedForce = undefined

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

    const runPoll = async (force) => {
      let next
      try {
        const response = await fetch(force ? ENDPOINT + '?refresh=1' : ENDPOINT, { cache: 'no-store' })
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
    }

    const poll = (force) => {
      const wantForce = force === true
      if (polling !== undefined) {
        // A plain poll in flight cannot stand in for a forced refresh: it
        // never sent ?refresh=1, so the host is free to answer it from its
        // throttle cache. Handing it back made the refresh control spin,
        // settle, and report success with nothing refetched upstream. Queue
        // the forced poll behind it instead — one at a time, so a held
        // button cannot stack requests.
        if (!wantForce || pollingForced) return polling
        if (queuedForce === undefined) {
          queuedForce = polling
            .then(() => poll(true))
            .finally(() => { queuedForce = undefined })
        }
        return queuedForce
      }
      pollingForced = wantForce
      polling = runPoll(wantForce).finally(() => {
        polling = undefined
        pollingForced = false
      })
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

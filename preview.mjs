/*
 * Demo page generator (development only — never shipped; package.json "files"
 * is a whitelist that excludes this script and its output).
 *
 * Renders the REAL plugin — the CSS client.js injects, the real component, the
 * real React from the dsh profiles tree — into a static page, so the quota
 * rings can be looked at in a real browser. A browser is required rather than
 * optional: conic-gradient and the host's corner-shape smoothing have no
 * meaningful server-side output, and corner-shape is exactly what the ring
 * geometry has to survive.
 *
 * The DSW token values below are APPROXIMATIONS of the host theme, present
 * only so colors resolve on a bare page. The shipped plugin never defines
 * them — it reads whatever the host provides.
 *
 * Regenerate after any client.js change: npm run preview
 */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = process.argv[2] ?? here
const out = process.argv[3] ?? join(here, 'docs', 'preview.html')

// Resolve ONE self-consistent (react, react-dom) pair, for the reason
// client-smoke.mjs documents: mixed 18/19 copies fail SSR because the two
// versions use different element symbols.
const resolvePair = (base) => {
  const baseRequire = createRequire(base)
  const pairRequire = createRequire(baseRequire.resolve('react-dom/package.json'))
  return { React: pairRequire('react'), renderToString: pairRequire('react-dom/server').renderToString }
}
let React, renderToString
try {
  ;({ React, renderToString } = resolvePair(join(homedir(), '.dsh', 'profiles', 'web', 'client-smoke.js')))
} catch {
  ;({ React, renderToString } = resolvePair(join(repo, 'package.json')))
}

// --- run the bundle the way the browser module system does ----------------
const styleTags = []
globalThis.document = {
  visibilityState: 'visible',
  addEventListener() {}, removeEventListener() {}, querySelector() { return null },
  createElement(tag) { return { tag, dataset: {}, textContent: '', style: {} } },
  head: { appendChild(el) { styleTags.push(el) } },
}
let handoff
globalThis.window = { __ModuleLoader__: { load(h) { handoff = h } } }
new Function('window', await readFile(join(repo, 'client.js'), 'utf8'))(globalThis.window)

const platform = {
  react: React,
  '@deepseek-ai/dsh-client-ui-primitives': {
    Tooltip: (p) => p.children,
    IconChevronDownOutline14: (p) => React.createElement('svg', {
      className: p.className, width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none',
    }, React.createElement('path', {
      d: 'M3.5 5.5 7 9l3.5-3.5', stroke: 'currentColor', strokeWidth: 1.4,
      strokeLinecap: 'round', strokeLinejoin: 'round',
    })),
    IconRefreshOutline14: (p) => React.createElement('svg', {
      className: p.className, width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none',
    }, React.createElement('path', {
      d: 'M12 7a5 5 0 1 1-1.6-3.7M12 2v3H9', stroke: 'currentColor', strokeWidth: 1.4,
      strokeLinecap: 'round', strokeLinejoin: 'round',
    })),
  },
}
const exports_ = handoff.factory((spec) => platform[spec])
const css = styleTags[0].textContent

// apply() starts the 30s poll interval; hold its disposer so this script can
// exit on its own instead of being killed.
let Panel
const disposers = []
exports_.apply({
  effect: (register) => { disposers.push(register()) },
  slots: { inject(_name, reg) { reg() }, register(_spec, component) { Panel = component; return {} } },
})

// --- samples ---------------------------------------------------------------
const now = Date.now()
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H
const snap = (windows, planLevel = 'Max') => ({
  phase: 'ready', data: { planLevel, relevant: true, windows, fetchedAt: now, retryAt: 0, error: '' },
})
const render = (wide, snapshot) => renderToString(React.createElement(Panel, {
  wide, useQuota: (sel) => sel(snapshot), refresh: () => {},
}))
// Demo-only: "open" is component state the SSR pass leaves closed, and this
// page has no React runtime to click it with.
const opened = (html) => html.replace('class="dshGlm ', 'class="dshGlm dshGlmOpen ')

const detail = (windows, planLevel) => opened(render(true, snap(windows, planLevel)))
const capsule = (windows) => render(true, snap(windows))
const rail = (windows) => render(false, snap(windows))

const samples = {
  detailLow: detail([
    { id: '5h', label: '5h', percent: 1, resetAt: now + 59 * M },
    { id: '7d', label: '7d', percent: 34, resetAt: now + 3 * D },
    { id: 'mcp', label: 'MCP', percent: 1, used: 11, limit: 4000, resetAt: now + 23 * D + 11 * H },
  ]),
  detailHigh: detail([
    { id: '5h', label: '5h', percent: 96, resetAt: now + 12 * M },
    { id: '7d', label: '7d', percent: 75, resetAt: now + 2 * D + 6 * H },
    { id: 'mcp', label: 'MCP', percent: 100, used: 4000, limit: 4000, resetAt: now + 5 * H },
  ]),
  detailExpired: detail([
    { id: '5h', label: '5h', percent: 62, resetAt: now - S },
    { id: 'mcp', label: 'MCP', percent: 25, used: 999999, limit: 1000000, resetAt: 0 },
  ], ''),
  capsules: [1, 29, 62, 88].map((p) => ({
    p, html: capsule([{ id: '5h', label: '5h', percent: p, resetAt: now + 41 * M }]),
  })),
  rail: rail([
    { id: '5h', label: '5h', percent: 1, resetAt: now + 58 * M },
    { id: 'tok-b', label: '窗口 B', percent: 29, resetAt: now + 2 * M },
    { id: 'tok-c', label: '窗口 C', percent: 62, resetAt: now + H + 5 * M },
    { id: 'tok-d', label: '窗口 D', percent: 88, resetAt: now + 23 * D + 11 * H },
    { id: 'tok-e', label: '窗口 E', percent: 0, resetAt: now + 59 * S },
  ]),
}

// --- page ------------------------------------------------------------------
const tokens = `
body:not([data-ds-dark-theme]){
  --dsw-alias-label-primary:#1c1c1e;--dsw-alias-label-secondary:#4b4b50;
  --dsw-alias-label-tertiary:#8a8a8f;--dsw-alias-label-dimmed:#c2c2c7;
  --dsw-alias-border-l1:#e8e8ed;--dsw-alias-border-l2:#d6d6db;
  --dsw-alias-bg-layer-1:#fff;--dsw-specific-menu:#fff;
  --dsw-alias-button-floating-hover:#f5f5f7;--dsw-alias-interactive-bg-hover:#efeff2;
  --dsw-alias-state-business-primary:#4d6bfe;
  --dsw-static-green-400:#34c759;--dsw-static-green-500:#28a745;--dsw-static-red-500:#ff3b30;
  --dsw-shadow-lv3:0 8px 28px rgb(0 0 0 / 12%);
  --page:#f2f2f7;--pageInk:#1c1c1e;--pageDim:#6e6e73;--pageCard:#fff;--pageLine:#e2e2e7;
}
body[data-ds-dark-theme]{
  --dsw-alias-label-primary:#f2f2f7;--dsw-alias-label-secondary:#c7c7cc;
  --dsw-alias-label-tertiary:#8a8a8f;--dsw-alias-label-dimmed:#5a5a5f;
  --dsw-alias-border-l1:#2c2c2e;--dsw-alias-border-l2:#3a3a3c;
  --dsw-alias-bg-layer-1:#1c1c1e;--dsw-specific-menu:#242426;
  --dsw-alias-button-floating-hover:#2c2c2e;--dsw-alias-interactive-bg-hover:#323235;
  --dsw-alias-state-business-primary:#6b84ff;
  --dsw-static-green-400:#34c759;--dsw-static-green-500:#28a745;--dsw-static-red-500:#ff3b30;
  --dsw-shadow-lv3:0 8px 28px rgb(0 0 0 / 45%);
  --page:#0f0f10;--pageInk:#f2f2f7;--pageDim:#98989d;--pageCard:#19191b;--pageLine:#2c2c2e;
}`

// The host theme's app-wide corner smoothing, verbatim
// (dsh-client-ui-theme corner-shape.css.mjs). The demo is only honest if the
// rings have to survive it.
const hostCorners = '@supports (corner-shape:superellipse(1.5)){:root{--dsw-corner-shape:superellipse(1.5)}*,:before,:after{corner-shape:var(--dsw-corner-shape)}}'

const card = (cap, bay, html) => `  <figure class="card"><figcaption>${cap}</figcaption><div class="${bay}">${html}</div></figure>`

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GLM 额度环 — 界面演示</title>
<style>
${tokens}
/* Host theme first, then the style tag the plugin appends to head — the same
   order the real app produces. */
${hostCorners}
${css}
*{box-sizing:border-box}
body{margin:0;padding:32px 24px 72px;background:var(--page);color:var(--pageInk);
  font:14px/1.5 -apple-system,"SF Pro Text","PingFang SC","Microsoft YaHei",system-ui,sans-serif}
h1{font-size:20px;font-weight:650;letter-spacing:-.01em;margin:0 0 6px}
h2{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:var(--pageDim);margin:40px 0 14px}
p.lede{margin:0 0 6px;color:var(--pageDim);max-width:74ch}
p.lede code{font-size:.92em}
.grid{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
.card{margin:0;background:var(--pageCard);border:1px solid var(--pageLine);border-radius:18px;
  padding:16px;box-shadow:0 1px 3px rgb(0 0 0 / 5%)}
.card figcaption{font-size:11px;color:var(--pageDim);margin:0 0 10px;letter-spacing:.02em}
/* The sidebar is 248px wide and the popover is absolutely positioned above
   the capsule, so each sample reserves room for it. */
.bay{width:248px;position:relative;display:flex;flex-direction:column;justify-content:flex-end}
.bay.tall{min-height:196px}
.bay.mid{min-height:152px}
.railbay{width:72px;display:flex;justify-content:center}
.toggle{position:fixed;top:20px;right:24px;padding:8px 16px;border-radius:999px;
  corner-shape:round;border:1px solid var(--pageLine);background:var(--pageCard);
  color:var(--pageInk);font:inherit;font-size:13px;cursor:pointer}
</style></head><body>
<button class="toggle" onclick="document.body.toggleAttribute('data-ds-dark-theme')">明 / 暗</button>
<h1>GLM 额度环 — 界面演示</h1>
<p class="lede">由 <code>preview.mjs</code> 生成：真实注入的插件 CSS + 真实组件 SSR 渲染，并叠加宿主的全局
<code>corner-shape:superellipse(1.5)</code>。页内 DSW 令牌值为近似值，仅用于让颜色在此页解析；真实配色以宿主主题为准。
<code>corner-shape</code> 需 Chrome 139+。</p>

<h2>详情浮层</h2>
<div class="grid">
${card('低用量 1%：非零用量保留最小可见弧', 'bay tall', samples.detailLow)}
${card('高用量 96% / 75% / 满额', 'bay tall', samples.detailHigh)}
${card('重置已过 · 无套餐档位 · 计数进位 1M', 'bay mid', samples.detailExpired)}
</div>

<h2>状态胶囊（五档配色）</h2>
<div class="grid">
${samples.capsules.map((c) => card(c.p + '%', 'bay', c.html)).join('\n')}
</div>

<h2>收起侧栏</h2>
<p class="lede">自上而下：1% / 58m、29% / 2m、62% / 1h5m、88% / 23d11h、0% / 59s——中心字号三档，真 0% 不画弧。</p>
<div class="grid">
${card('弧长 + 环内倒计时', 'railbay', samples.rail)}
</div>
</body></html>`

await writeFile(out, page, 'utf8')
for (const dispose of disposers) dispose()
console.log('preview written: ' + out)

# glm-quota — DSH 外部插件：智谱 GLM Coding Plan 额度面板

在 DSH Web GUI 左下角（Settings 按钮上方）显示智谱 GLM Coding Plan 的额度：
进度条式多窗口用量、五档配色、MCP 调用次数、下次刷新时间倒计时。
侧栏折叠时以圆环进度显示最高已用窗口。

**这是一个纯外部插件：不修改 dsh 本体任何代码。** 与宿主的全部接触点只有三处——
本目录（源码）、一个目录 junction、用户配置层里的一行挂载（见[安装](#安装)）。

npm 包名 **`dsh-glm-quota`**（npm 上的 `glm-quota` 已被他人占用）；从源码安装走下方 junction
流程，无需构建步骤。

---

## 目录

```
<插件目录>\            （本仓库解压/克隆到哪都行，例：D:\dev\dsh-glm-quota）
├── host.js           宿主半场：拉取额度 API、节流、缓存、HTTP endpoint
├── client.js         浏览器半场：侧栏面板（factory 格式 bundle，无构建步骤）
├── package.json      包声明 + dsh.client 清单（浏览器半场的发现入口）
├── smoke.mjs         host 半场冒烟测试
├── client-smoke.mjs  client 半场冒烟测试
├── README.md         本文件
└── node_modules/@deepseek-ai/   peer 依赖 junction（schemastery、dsh-credentials）
```

## 插件形态：双半场（dual-face）外部包

dsh 的 Web 组合里，一个 UI 插件由两个半场组成，本包用无构建方式同时提供两者：

### host 半场（host.js）

- **挂载机制**：`~/.dsh/cordis.patch.yml` 里一行 `- insert: [{ id: dsh-glm-quota, name: 'dsh-glm-quota', config: {...} }]`。
  loader 通过 profile 目录的 node_modules 向上查找解析包名（`~/.dsh/profiles/node_modules/dsh-glm-quota`
  junction 到本目录），直接 import 源码 —— 原生 ESM，无需编译。**挂载行的 `name` 同时是浏览器侧
  标识**：client bundle 的 boot graph id 与 `/plugins/<name>/client.js` URL 都由它派生，
  `client.js` 里的 handoff id 必须与之一致。
- **职责**：持有唯一一份数据与限流状态。监听会话事件、按 provider 门控、节流后请求
  智谱额度监控 API，把投影缓存在磁盘，并通过 `GET /glm-quota/state` 服务给浏览器。
- **导出**：`name` / `inject: ['webServer']` / `Config`（schemastery 校验）/ `apply(ctx, config)`。
  凭据通过 `ctx.get('credentials')` 在每次请求时现解析（credential seam，不在配置里写明文）。

### client 半场（client.js）

- **发现机制**：`package.json` 里的 `"dsh": { "client": { "platform": "web" } }` 清单。
  宿主的 `dsh-client-modules` 服务启动时扫描 loader 全部条目，发现此声明后把
  `./client` 导出加入浏览器 boot graph（`window.__DSH_BOOT__`），浏览器按
  `/plugins/dsh-glm-quota/client.js` 拉取。
- **格式**：手写的模块系统 factory bundle —— 整个文件是一次
  `window.__ModuleLoader__.load({ id, factory })` 调用；React、Tooltip 等平台模块通过
  注入的 `require` 从宿主模块表获取（跨包零值导入，全部走 cordis 服务与插槽）。
  **因此改面板无需任何构建步骤，保存即生效。**
- **职责**：纯展示。注册进 `sidebar.footer.action` 插槽（ui-sidebar 在 Settings 上方
  渲染的 footer action 列表），每 30s 轮询宿主 endpoint（页面不可见时暂停，回到前台立即补拉），
  通过注册时 inject 的 `hooks: { quota: source }` 把快照源绑成组件的 `useQuota` 选择器。

### 重载模型（改哪类文件要做什么）

| 改动 | 生效方式 |
|---|---|
| `cordis.patch.yml` 的 config 值 | 热重载，立即 |
| `client.js`（面板样式/文案/逻辑） | 宿主 HMR 链自动推送；至多 F5 一次 |
| `host.js`（拉取/节流/映射逻辑） | **需重启 `dsh web`**（生产启动无 `--expose-internals`，宿主模块不热载） |

重启后验证跑的是新版：响应头 `x-glm-quota-rev: relevance-1`（每次改 host.js 语义请同步
bump 源码里的 `MODULE_REV` 常量）。

---

## 安装

### 方式一：npm 安装（推荐）

包已发布到 npm（`dsh-glm-quota`），用 dsh 自带的插件管理命令一条完成安装与挂载：

```powershell
# 前置：Node ≥ 22、dsh ≥ 0.1.1、pnpm 在 PATH 上（corepack enable 或 npm i -g pnpm）
dsh plugin --profile web add dsh-glm-quota
dsh web    # 重启宿主（host 半场是模块代码）
```

浏览器 F5 后，左下角 Settings 上方出现额度面板。`dsh plugin` 会把包装进 profile
（`~/.dsh/profiles/web`）并把包内自带的挂载行（`cordis.patch.yml`）加入 profile 层——
**无需手工编辑任何 yml**。默认配置即开即用；需要覆盖配置（z.ai 的 baseURL、自定义
`watchProviders` 等）时，在 `~/.dsh/cordis.patch.yml` 写一个同 id 行提供 config 值即可
（键见[配置参考](#配置参考)）：

```yaml
# ~/.dsh/cordis.patch.yml —— 只覆盖需要改的键
- id: dsh-glm-quota
  name: dsh-glm-quota
  config:
    baseURL: 'https://api.z.ai'
```

升级 `dsh plugin --profile web update dsh-glm-quota`；卸载 `dsh plugin --profile web remove dsh-glm-quota`。

### 方式二：源码 junction 安装（本仓库开发 / 无 npm 环境）

全新机器（或重装 dsh 后）从源码安装，按顺序执行。整个过程**不修改 dsh 本体**；
所有命令幂等，重复执行安全。

### 前置条件

- Node ≥ 22、dsh 已安装（`dsh --version` 可用），且至少启动过一次 `dsh web`
  （保证 `~/.dsh/profiles/` 目录树存在）
- 智谱 API key 已配置为 dsh credential（见下节"API key 的来源与配置"）
- 本插件源码目录在位：本仓库所在目录（解压/克隆到哪都行，下面用 `$plugin` 变量指向它）

```powershell
# 前置检查（True = key 已配置；只查存在性，不显示值）
Test-Path "$env:USERPROFILE\.dsh\profiles"
Select-String "$env:USERPROFILE\.dsh\.credentials.yaml" -Pattern 'ZAI_CODING_CN_API_KEY' -Quiet
```

### API key 的来源与配置

**key 由用户自己提供：dsh 和本插件都不签发 key。** 在智谱开放平台控制台
（bigmodel.cn，z.ai 账号同理）的 API Keys 页面创建/查看，就是你自己账号的那把 key。

**本插件不单独要 key——它复用你 GLM 对话已经在用的那一把。** 你的
`~/.dsh/settings.yaml` 里 `zai-coding-cn` provider 声明了
`apiKeyEnv: ZAI_CODING_CN_API_KEY`；插件配置里的 `keyRef` 默认指向同一个引用名，
每次请求时通过 credential seam 现解析。一把 key、一处存储、换 key 一处生效
（换 key 后无需重启：插件监听 `credentials/updated`，自动清退避立即重拉）。

给 dsh 配这把 key 的三种方式（按凭据层优先级，高的覆盖低的）：

| 方式 | 操作 | 适用 |
|---|---|---|
| **GUI（推荐）** | Web GUI → Settings → 模型 → 对应 provider 卡片粘贴 key。写入 `~/.dsh/.credentials.yaml`，立即生效 | 日常使用 |
| 手动编辑文件 | `~/.dsh/.credentials.yaml` 加一行 `ZAI_CODING_CN_API_KEY: <你的key>`（外部编辑热生效） | 脚本化/无 GUI |
| 环境变量 | 启动前 `$env:ZAI_CODING_CN_API_KEY = '<你的key>'`（优先级最高） | CI / 临时换号 |

```yaml
# ~/.dsh/.credentials.yaml 手动方式的格式（纯 ref → 字符串映射，无其他字段；
# 值就是控制台复制来的完整 key，形如 32位十六进制.16位大小写字母数字）
ZAI_CODING_CN_API_KEY: <控制台复制的完整key>
```

> 已经能用 GLM 对话的机器（如本机）这步天然满足——key 早就在 credential 存储里了，
> 装插件时**无需任何 key 操作**。

### 第 1 步：一键安装脚本

整段复制进 PowerShell 执行：创建两个 junction、把挂载行追加进配置层
（任何一项已存在就跳过，不会重复添加）。

```powershell
$plugin   = 'D:\dev\dsh-glm-quota'   # ← 改成本仓库在你机器上的实际路径
$profiles = "$env:USERPROFILE\.dsh\profiles"

# 1a. peer 依赖 junction：本包的 import 解析到 dsh 自己的包实例（单一 cordis/schemastery）
New-Item -ItemType Directory -Force "$plugin\node_modules\@deepseek-ai" | Out-Null
foreach ($p in 'schemastery', 'dsh-credentials') {
  $link = "$plugin\node_modules\@deepseek-ai\$p"
  if (-not (Test-Path $link)) {
    New-Item -ItemType Junction -Path $link -Value "$profiles\node_modules\@deepseek-ai\$p" | Out-Null
    Write-Host "peer junction created: $p"
  }
}

# 1b. 挂载 junction：loader 从 profile 的 node_modules 解析包名 'dsh-glm-quota'
$mount = "$profiles\node_modules\dsh-glm-quota"
if (-not (Test-Path $mount)) {
  New-Item -ItemType Junction -Path $mount -Value $plugin | Out-Null
  Write-Host 'mount junction created'
}

# 1c. 挂载行：尚未包含 glm-quota 时追加到 ~/.dsh/cordis.patch.yml（UTF-8 无 BOM，原子语义）
$patch = "$env:USERPROFILE\.dsh\cordis.patch.yml"
if (-not (Select-String -Path $patch -Pattern 'id: dsh-glm-quota' -Quiet)) {
  $row = @"

# dsh-glm-quota: Zhipu GLM Coding Plan quota panel (sidebar foot, above Settings).
# All config keys are optional; full reference in the plugin README.
- insert:
    - id: dsh-glm-quota
      name: 'dsh-glm-quota'
      config:
        keyRef: ZAI_CODING_CN_API_KEY
        baseURL: 'https://open.bigmodel.cn'
        watchProviders: [zai-coding-cn]
        minFetchIntervalMs: 60000
        rateLimitBackoffMs: 120000
"@
  [System.IO.File]::AppendAllText($patch, $row)
  Write-Host 'patch row appended'
} else {
  Write-Host 'patch row already present'
}

# 1d. 自检：host 半场能被 Node 从 profile 目录解析
Push-Location $profiles
node -e "import('dsh-glm-quota').then(m => console.log('host half OK:', m.name, '| inject:', m.inject.join(','))).catch(e => { console.error('FAIL:', e.message); process.exit(1) })"
Pop-Location
```

最后一行输出 `host half OK: dsh-glm-quota | inject: webServer` 即本步成功。
config 键的含义与默认值见下方[配置参考](#配置参考)，全部可省略。

### 第 2 步：重启 dsh web 并验证

host 半场是模块代码，首次安装需重启一次宿主；浏览器随后 F5 读入新 boot graph 行。

```powershell
# 重启宿主（先停掉现有 dsh web 进程，再启动）
dsh web

# 三项验证（都应成立）：
(Invoke-WebRequest http://127.0.0.1:3080/glm-quota/state).StatusCode              # 200
(Invoke-WebRequest http://127.0.0.1:3080/glm-quota/state).Headers['x-glm-quota-rev']  # relevance-1
Get-Content "$env:USERPROFILE\.agents\glm-quota\state.json"                    # 投影 + lastAttemptAt
```

浏览器 F5 后，左下角 Settings 上方出现额度面板即安装完成。

### dsh 升级 / 重装后恢复

升级会重建 `~/.dsh/profiles/node_modules`（junction 消失）；源码目录与配置层不受影响。
恢复 = 重跑**第 1 步脚本**（幂等）→ 重启 `dsh web` → F5。同样的手法参考同机的
dsh-vision-router 插件。

### 分发给他人（接收方注意事项）

已发布 npm：接收方 `dsh plugin --profile web add dsh-glm-quota` 一条命令即装（方式一）。
离线场景用 zip（`git archive` 导出）走源码 junction 安装（方式二）——包不含任何 key
与机器特定信息，可直接分发。两种方式都**有两个值必须对照自己的
`~/.dsh/settings.yaml` 核对**——插件的默认值按 `zai-coding-cn` 这套常见配置写死，
不匹配则额度刷新不触发：

| 核对项 | 在哪看 | 不匹配时改哪 |
|---|---|---|
| provider id | `settings.yaml` 的 `agent-default-model.provider`（或 `llm-pi-ai.providers` 下的键名） | 挂载行 `watchProviders: [<你的provider id>]` |
| key 引用名 | 同 provider 声明的 `apiKeyEnv` | 挂载行 `keyRef: <你的apiKeyEnv>` |

其余差异：z.ai 账号（非 bigmodel.cn）把 `baseURL` 改为 `https://api.z.ai`；
周限窗口是否显示由计划决定（pro/lite 有、Max 当前无），见"面板显示"。

### 卸载

```powershell
# 1. 删配置：编辑 ~/.dsh/cordis.patch.yml，删除 dsh-glm-quota 的整个 "- insert:" 块
#    （从 "# dsh-glm-quota:" 注释行到 "rateLimitBackoffMs" 行）。热生效：
#    路由、事件监听、定时器随 fiber 销毁，无需重启。
# 2. 删 junction（源码目录保留，可随时重装）：
Remove-Item "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-glm-quota"
Remove-Item "$plugin\node_modules" -Recurse -Force
# 3. 可选：删磁盘缓存与源码目录
Remove-Item "$env:USERPROFILE\.agents\glm-quota" -Recurse -Force
# Remove-Item $plugin -Recurse -Force
```

---

## 实现原理

### 数据流总览

```
智谱会话事件(session/event)                     空闲/非智谱会话
      │ 所有事件"想"刷新                              │
      ▼                                              ▼
provider 门控(按 session 跟踪) ──── 非智谱 → 忽略(零请求) ──── 定时器纯内存检查,不发请求
      │ 智谱且 turn 进行中
      ▼
单一节流阀 ── 窗口内? ── 是 → 吞掉(单飞合并)
      │ 窗口外(默认 ≥60s)
      ▼
lastAttemptAt 先落盘(~/.agents/glm-quota/state.json) ──► 请求 {baseURL}/api/monitor/usage/quota/limit
      │                                                (token 裸传,无 Bearer;必须带
      ▼                                                 Accept-Language + Content-Type)
投影写入 state.json + 内存 ──► GET /glm-quota/state ──► client 轮询(30s) ──► 面板渲染
```

### host 半场核心机制

**provider 识别（按 session 独立跟踪，多会话并行互不干扰）**

- `request/header` 事件 → `header.config.provider`（会话首个请求及每次配置变更记录）
- `assistant/message` 事件 → `message.source.provider`（每个完成的步骤都带）
- 其余事件（`assistant/chunk`、`tool/call`…）复用该 session 已跟踪的路由
- `turn/start`/`turn/end` 维护"该会话是否有回合在跑"（Map，`session/disposed` 清理）
- 智谱的 Anthropic 兼容与 OpenAI 兼容两个 baseURL 端点共用 provider id
  `zai-coding-cn`，所以 `watchProviders` 一条即覆盖两者

**模型清单在 dsh 侧配置，插件不感知具体模型**

glm-5.3、glm-5.3-flash 等模型声明在 dsh 自己的 `~/.dsh/settings.yaml` 里
`zai-coding-cn` provider 的 `models` 列表下（`id` / `name` / `contextWindow` /
`maxTokens` / `reasoningEfforts` / `compat` 等字段）。要上新模型，只需在那里追加一条：

```yaml
# ~/.dsh/settings.yaml → zai-coding-cn.models 追加（示意，字段可按需精简）
- id: glm-5.3-flash
  name: glm-5.3-flash
  contextWindow: 1000000
  maxTokens: 128000
  compat:
    thinkingFormat: zai
    supportsReasoningEffort: true
```

本插件只按 provider id（`zai-coding-cn`）门控刷新：models 列表怎么增删、一回合用
glm-5.3 还是 glm-5.3-flash，面板都无需任何改动——套餐内所有模型共用同一组
5h / 周 / MCP 窗口。

**节流算法（所有触发汇入同一阀）**

```
fetchUpstream(force) 的决策（单飞：并发触发共享一次执行）:
  1. 重读 state.json —— 文件是跨进程权威（重启/并行 dsh 同 key 都被管住）
  2. retryAt > now ?                是 → 放弃（退避中）
  3. !force && now - lastAttemptAt < minFetchIntervalMs ?  是 → 放弃（窗口内吞掉）
  4. lastAttemptAt = now 并立刻落盘 —— 先写文件再发请求
  5. 发请求；成功 → 更新投影+落盘；失败 → 按类别设 retryAt
```

触发源三处：会话事件（活跃智谱会话的每个事件）、步进定时器（同 `minFetchIntervalMs`
间隔，兜底长工具调用间隙；无活跃智谱会话时是纯内存检查零请求）、手动
`?refresh=1`（唯一可越过节流的入口，显式人为操作）。

**失败退避**

- HTTP 429：`max(Retry-After 头, rateLimitBackoffMs)`；退避期间继续服务上次成功数据
- 其他失败/超时（4s 超时上限）：`errorBackoffMs`
- 凭据缺失：**不退避**（配置问题而非 API 失败，修好后下一触发立即生效）
- `credentials/updated` 事件：清空退避与间隔记忆，立即重拉

**窗口映射（与参考实现 quota_glm.go 一致）**

| API (type, unit, number) | 窗口 |
|---|---|
| TOKENS_LIMIT, 3, 5 | 5 小时滚动窗口（`5h`） |
| TOKENS_LIMIT, 6, 1 | 周额度（`7d`）——计划没有就不返回该行，面板自动不渲染 |
| TIME_LIMIT | MCP 次数上限；cap 在 `usage` 字段、已用在 `currentValue`（沿用 Go 的字段复用映射） |
| 其他 TOKENS_LIMIT / 其他 type | 通用扩展窗口（`Tok(uX,nY)` / 小写 type） |

**状态文件**（`~/.agents/glm-quota/state.json`，原子写：tmp + rename）

```json
{
  "planLevel": "Max",
  "windows": [
    { "id": "5h", "label": "5h", "percent": 20, "resetAt": 1787117962367 },
    { "id": "mcp", "label": "MCP", "percent": 1, "used": 15, "limit": 4000, "resetAt": 1789522977998 }
  ],
  "fetchedAt": 1787115844621,
  "retryAt": 0,
  "error": "",
  "lastAttemptAt": 1787115844321
}
```

GET 时若磁盘文件比内存新则采纳 —— 并行的 headless dsh 刷新过额度时，Web 面板能读到。
无任何 secret 落盘。

**HTTP API**

- `GET /glm-quota/state` → 上述投影 JSON（响应头含 `x-glm-quota-rev` 版本标记）
- `GET /glm-quota/state?refresh=1` → 强制越过节流刷新一次后返回
- 路由注册在宿主 webServer（`ctx.effect` 包裹，fiber 销毁即摘除）

### client 半场核心机制

- **插槽注册**：`ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({...}, QuotaPanel))`
  —— ui-sidebar 声明的 footer action 列表插槽，渲染于 Settings 上方；owner 传 `wide`
  （侧栏展开/折叠），inject 提供 `refresh` 回调与 `hooks.quota` 快照源
- **数据通道**：`hooks` compartment 是设计上唯一合法的"注册方私有可变事实"通道，
  渲染层把它绑成 `useQuota` 选择器 hook（uSES），组件零订阅样板
- **渲染**：
  - 每窗口一行：标签 + 8px 圆角进度条（渐变填充 + 同色微光 + 0.6s 缓动）+ 数值
    （百分比；MCP 为 `已用/上限` 次数）。窗口行按 API 返回**条件渲染**：
    **周限（7d，标签"周限"）只在 API 返回该窗口时显示** —— pro/lite 计划返回周限；
    Max 计划当前不返回（实测 2026-08），智谱开始返回即自动出现，无需改代码。
    API 的 TOKENS_LIMIT 行只带百分比（`usage`/`currentValue` 为空），故周限与
    5小时均为百分比进度条，无额度数值可显示
  - 五档配色（沿用 quotaPercentColor）：<20% 亮绿、<40% 绿、<60% 青、<80% 黄、≥80% 红；
    暗色主题（`body[data-ds-dark-theme]`）自动换色值；主题 token 优先
    （`--dsw-static-green-400` 等），主题没有的档位用固定色
  - 头部：`GLM` 标题 + 计划名药丸徽章 + 手动刷新按钮（请求在途时旋转）+
    **折叠按钮（▼）**：点击收起面板只留标题行，再点展开；偏好存 localStorage，
    刷新页面/重启浏览器后保持。折叠态不显示手动刷新与陈旧标记
  - 底部**逐窗口重置行**：`↻ 5h 剩1h23m · 周限 剩2d14h · MCP 剩12d` ——
    每个窗口的下一次刷新倒计时都直接可见（不再只显示最近一个，否则周限的重置
    永远被 5h 挡住）；悬停 Tooltip 显示各窗口重置的绝对时间；每行 title 另带
    各自重置时间；每 30s 走秒
  - 折叠态（rail）：SVG 圆环进度 = 最高已用窗口，颜色取其档位；悬停 Tooltip 摘要
    （含周限百分比）；点击刷新
  - 空闲静默是设计行为：所有会话不在跑时面板冻结（数据不旧于最后一次会话内刷新）
  - `prefers-reduced-motion` 下关闭所有动画

---

## 配置参考

配置在 `~/.dsh/cordis.patch.yml` 的挂载行 `config` 下，全部键可省略：

| 键 | 默认 | 说明 |
|---|---|---|
| `keyRef` | `ZAI_CODING_CN_API_KEY` | credential 引用名（值存于 `~/.dsh/.credentials.yaml`，每次请求现解析） |
| `watchProviders` | `[zai-coding-cn]` | 哪些 provider id 的会话驱动刷新；两个协议端点共用一个 id |
| `baseURL` | `https://open.bigmodel.cn` | 额度监控 API 基址；z.ai 账号填 `https://api.z.ai` |
| `minFetchIntervalMs` | `60000` | 上游请求最小间隔 —— 限流核心，同时也是步进定时器间隔（下限 500） |
| `errorBackoffMs` | `60000` | 普通失败退避 |
| `rateLimitBackoffMs` | `120000` | 429 退避下限（与 Retry-After 取大） |
| `stateFile` | `~/.agents/glm-quota/state.json` | 投影 + 限流权威文件路径 |

## 行为速查

**自动隐藏（relevant 门控）**：宿主响应携带 `relevant` 标志——仅当"见过 watched
provider 的会话"且"credential 可解析"都成立才为 true。不成立时（这台机器从不用
智谱、或 key 未配置）**面板从侧栏完全消失**而非显示错误占位。所以插件可装在任意
机器上：不用智谱的机器零感知。

| 场景 | 上游请求 |
|---|---|
| 智谱会话在跑（任意事件流） | 规整为每 `minFetchIntervalMs`（默认 1 分钟）最多 1 次 |
| 所有会话空闲 / 只有非智谱会话在跑 | 0 次（定时器纯内存检查） |
| 宿主启动 | 1 次首拉（若文件记录的最近请求仍在窗口内则被压制） |
| 手动 ↻ / `?refresh=1` | 立即 1 次（可越过节流；仍受退避约束） |
| 429 / 失败退避中 | 0 次，面板显示上次成功数据 + 陈旧标记 |
| 从未见过 watched 会话 / key 未配置 | 面板自动隐藏（relevant=false，零上游请求） |

## 开发与调试

```sh
node smoke.mjs         # host 半场：窗口映射/provider 门控/事件合并/定时器兜底/
                       #   turn-end 吞掉/跨实例文件节流/空闲零请求/429 退避/状态文件
node client-smoke.mjs  # client 半场：handoff 格式/插槽注册/hooks 绑定/轮询/SSR 渲染断言
```

改代码：config 值热生效；`client.js` 保存即推送（至多 F5）；`host.js` 重启 `dsh web`
并 bump `MODULE_REV`。

**面板不显示排查**：① `curl /glm-quota/state` 是否 200 JSON（否 → patch 行/junction/重启）
② 响应头有无 `x-glm-quota-rev`（无 → 旧模块仍在跑，重启）③ F5 后浏览器控制台有无
dsh-glm-quota 加载错误 ④ `~/.agents/glm-quota/state.json` 的 `error` 字段（凭据未配置/
API 失败会在面板显示"额度不可用"）。

## 来源致谢

窗口映射（(type, unit, number) 分发）、五档配色阈值、API 请求头要求与 429 处理，
移植自开源状态栏项目 claude-token-monitor 的 `quota_glm.go`（智谱额度监控部分）。

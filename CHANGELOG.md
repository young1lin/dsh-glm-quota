# 更新日志

记录用户可感知的变化；格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
版本号见 `package.json`。

## [0.1.2] - 2026-09-02

### 改进

- 重新设计侧栏额度入口：常驻区域缩减为 42px 状态胶囊，详情改为按需弹出的 Apple Control Center 风格浮层，不再持续挤占工作区列表。
- 使用紧凑圆环指标替代线性进度条；保留每个窗口的精确占用、MCP 次数、重置倒计时、手动刷新、陈旧状态和五档主题配色。
- 周额度严格按 API 的 `7d` 窗口条件渲染：V1/Max 无周额度时不留空位，V2 及以上返回后自动显示。
- 与 DSH 会话拖拽联动：拖到额度入口附近时继续滚动原生 workspace tree，避免 footer 截断底部自动滚动。
- 补充键盘、焦点、Esc/点外关闭、暗色主题与 reduced-motion 适配，并扩展 client smoke 覆盖。

## [0.1.1] - 2026-08-31

### 新增

- 包名改为 scoped：**`@young1lin/dsh-glm-quota`**（0.1.0 曾以非 scoped 名
  `dsh-glm-quota` 发布过一次，已废弃）。安装：
  `dsh plugin --profile web add @young1lin/dsh-glm-quota`。
- 声明 `dsh.bundle.patch`（随包发布 `cordis.patch.yml` 挂载行）：`dsh plugin add`
  一条命令完成安装与挂载，无需再手工编辑 `~/.dsh/cordis.patch.yml`。

## [0.1.0] - 2026-08-31

首个 npm 发布（包名 `dsh-glm-quota`；npm 上的 `glm-quota` 已被他人占用）。

### 新增

- 侧栏底部（Settings 上方）GLM Coding Plan 额度面板：多窗口进度条（5 小时 / 周限 / MCP）、
  五档配色（暗色主题适配）、折叠圆环态（最高已用窗口）、逐窗口重置倒计时、手动刷新。
- host 半场：会话事件驱动 + 单一节流阀（默认每 60s 至多一次上游请求），空闲零请求；
  状态文件跨进程权威；429 按 Retry-After 退避；凭据缺失不退避；凭据轮换即时重拉。
- `GET /glm-quota/state` 端点（`?refresh=1` 强制刷新）；`relevant` 门控 ——
  不用智谱或未配 key 的机器上面板自动隐藏、零上游请求。
- 冒烟测试：host 半场（窗口映射 / provider 门控 / 节流 / 退避 / 状态文件）与
  client 半场（handoff 格式 / 插槽注册 / 轮询 / SSR 渲染断言）。
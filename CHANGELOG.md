# 更新日志

记录用户可感知的变化；格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
版本号见 `package.json`。

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
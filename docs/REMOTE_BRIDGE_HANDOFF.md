# Copilot Bridge：当前能力与远程 Gateway 开发交接

## 文档用途

本文档用于把当前项目的真实实现、验证边界、协议契约和已知限制交给下一位
AI，用于规划未来的个人 Remote Copilot Bridge Server。

本文档不会声称远程服务器模式已经存在。所有“远程模式”内容均为未来开发
边界或待决策问题。

未来目标使用场景是：

```text
个人服务器保存 GitHub Copilot runtime / session
        ↓
一个或多个经本人授权的客户端设备访问
```

在允许多用户、公开、商业或共享账号访问前，必须先验证 GitHub Copilot 当前
订阅条款和许可边界。

## 当前产品范围

Copilot Bridge 是一个 Windows 桌面应用，让 ChatGPT Desktop Codex 在以下
两个相互隔离的环境中切换：

```text
Original ChatGPT / Codex 环境
GitHub Copilot Bridge 环境
```

当前已经真实验证的本地拓扑：

```text
ChatGPT Desktop / Codex
  -> 本地 OpenAI Responses 兼容 Bridge
  -> 官方 GitHub Copilot SDK/runtime
  -> GitHub Copilot backend
```

当前本地 Bridge 仅监听：

```text
http://127.0.0.1:8787
```

它不是网络服务。未经独立的认证、TLS、限流、session 隔离和日志脱敏设计，
不得直接暴露到公网。

## 已验证能力边界

### 通过真实 Desktop E2E 验证

| 能力 | 验证结果 |
| --- | --- |
| 独立 Bridge Home | Windows 重启后，Store ChatGPT Desktop 实际采用独立 `CODEX_HOME` |
| Original 恢复 | 清除用户级 `CODEX_HOME`、重启并启动 Desktop 后回到 Original Home |
| Responses 流 | 本地 `/v1/responses` 返回 SSE 和 `response.completed` |
| 模型路由 | Codex-facing model 可路由到配置的 Copilot backend model |
| Tool loop | Codex 执行外层工具；Bridge 关联 `function_call_output` 并恢复同一 Copilot SDK session |
| Desktop Agent 工作流 | Desktop 读取源码、应用 patch、运行 `npm test` 并得到 continuation |
| Session 隔离 | Bridge / Original 的 session 文件与 index 在双向切换后保持分离 |
| Workspace 隔离 | Bridge / Original workspace sentinel 记录不会泄漏到另一 Profile |
| SQLite 完整性 | Original / Bridge 各自数据库通过只读 `PRAGMA quick_check` |
| 应用管理 Bridge 生命周期 | 安装版 App 启动 packaged proxy；health 返回 `ok` 和 protocol version 3 |
| 应用模型持久化 | 选择 `gpt-5.6-terra` / `high` 后设置被持久化、Bridge 重启后 health 保持正常 |
| NSIS 安装器 | 0.1.0 已通过真实 per-user 安装和启动验收 |

### 仅通过自动化测试或本地进程验证

| 能力 | 当前边界 |
| --- | --- |
| ProfileStore 事务 | 使用 fake user environment 测试 journal、Bridge/Original 选择和 restart acknowledgement |
| Device-code 输出解析 | 单元测试仅验证公开 device code / verification URL 文本解析 |
| UI 组件 | 已 build/typecheck 并做 packaged renderer 截图；并非所有交互路径都做完整 E2E |
| Bridge restart race 修复 | 真实本地 health 检查通过 |
| 安装器升级 | 尚未完成“第二个版本覆盖 0.1.0”的真实升级验收 |

### 未验证或未实现

| 能力 | 状态 |
| --- | --- |
| Remote/public Bridge server | 未实现 |
| HTTPS/TLS termination | 未实现 |
| Remote client authentication | 未实现 |
| 多设备注册/撤销 | 未实现 |
| Server-side credential vault | 未实现 |
| 多用户租户隔离 | 未实现 |
| Fresh device-code login E2E | UI/controller 已有；隔离凭据环境中的真实登录尚未验收 |
| App 驱动的完整 Bridge -> Original -> Bridge 重启循环 | 部分执行；安装版完整流程未结束 |
| ChatGPT Desktop 自动检测/关闭/重启 | 未实现 |
| 自动验证 Windows restart 是否完成 | 未实现，当前只做环境和 journal 检查 |
| Tray / startup / Settings / Diagnostics 产品流程 | 未实现或未验收 |
| Copy-only local session import | 已明确从首发范围延后 |

## 本地 Profile 架构

### Original Profile

Original Profile 默认目录：

```text
%USERPROFILE%\.codex
```

它属于用户。硬规则：

- 不删除；
- 不移动；
- 不调用 logout；
- 不覆盖 session、SQLite、cache 或 authentication。

### Bridge Profile

Bridge Profile 目录：

```text
%USERPROFILE%\.copilot-bridge\profiles\bridge\codex-home
```

其中 Codex-compatible provider 指向：

```text
http://127.0.0.1:8787/v1
```

Bridge Profile 当前权限来自用户明确选择：

```toml
sandbox_mode = "danger-full-access"
approval_policy = "on-request"
```

这让 Desktop Agent 拥有较宽的本机访问范围，但 ChatGPT/Codex 仍是实际的
工具执行方。未来 Remote 模式不得把这个本机 host permission 意外迁移成
远程服务器的文件/命令执行权限。

### Profile 选择方式

已验证的选择机制是持久化的用户级 Windows 环境变量：

```text
CODEX_HOME
```

| 目标 Profile | 用户级 `CODEX_HOME` |
| --- | --- |
| Original | 未设置 |
| Bridge | Bridge Home 路径 |

当前必须 Windows 重启或注销再登录，以让 Store activation / Explorer 继承
新环境。

真实 `.codex` 目录全量 rename 不是 release backend。对
`%USERPROFILE%\.codex` 的真实尝试持续返回 Windows `EPERM`，包括普通
用户、管理员、停止服务和重启后的实验。

## 协议边界

### 当前 Client-to-Bridge 契约

Bridge 接受 OpenAI Responses-compatible 请求：

```text
POST /v1/responses
GET  /health
GET  /bridge/models
```

本地 App / 诊断接口：

```text
GET /bridge/models
```

返回真实 SDK capability：

```json
{
  "data": [
    {
      "id": "gpt-5.6-terra",
      "supportsReasoningEffort": true
    }
  ]
}
```

现有 proxy 也支持 `GET /v1/models`。Codex provider 已复用已有 models
handler 注册该 endpoint，没有重写 Responses 或 Tool Bridge。

### Streaming

Responses 使用 SSE：

```text
response.created
response.in_progress
response.output_item.added
response.output_text.delta
response.completed
```

### Tool 协议

核心 tool loop：

```text
Copilot SDK session
  -> external_tool.requested
  -> Bridge 发送 Responses function_call（call_id）
  -> ChatGPT/Codex 执行本地工具
  -> ChatGPT/Codex 发送同一 call_id 的 function_call_output
  -> Bridge 调 SDK pending-tool RPC
  -> 同一个 Copilot SDK session 恢复
  -> 最终 SSE response.completed
```

安全边界：

```text
Copilot 决定是否需要工具
ChatGPT/Codex 执行本机 filesystem / shell / patch 工具
Bridge 只负责声明、转发、关联、恢复和 streaming
```

当前 E2E 配置：

```json5
allowedCliTools: []
```

因此 Copilot 自己的 CLI tools 不会私自访问用户文件系统或 shell。

### Tool Bridge 生命周期

`CodexToolBridge` 当前支持：

- `call_id` 关联；
- 顺序和关联 tool outputs；
- 同一 session continuation；
- client disconnect cancellation；
- pending-tool timeout；
- 每个 conversation 独立 Bridge instance；
- 25ms 相邻 SDK external-tool 事件批处理，避免 Desktop multi-tool race。

## 模型架构

必须区分三层：

```text
1. ChatGPT Desktop/Codex compatibility model
2. Bridge routing model
3. GitHub Copilot SDK backend model
```

示例：

```text
ChatGPT client 发送 gpt-5.5 或 gpt-5.6-luna
  -> Bridge backendModel configuration
  -> GitHub Copilot SDK session 使用 gpt-5.6-terra 或 Claude Sonnet 5
```

不能使用 Agent 对“你是什么模型”的自述作为 backend routing 证据。Agent
可能从自身 instruction 报告通用 Codex/GPT 身份，而真实 Copilot backend
不同。

可靠证据：

- App 持久化的 Bridge setting；
- Bridge `/bridge/models` capability 数据；
- Bridge health；
- Bridge 日志/session creation 状态；
- proxy 创建 SDK session 时的实际 model。

## 当前桌面 App

源码目录：

```text
copilot-bridge-app\
```

技术栈：

```text
Electron
React
TypeScript
Vite
electron-builder
NSIS per-user installer
```

### 已安装 Release

当前安装器：

```text
Copilot Bridge Setup 0.1.0.exe
```

默认安装目录：

```text
%LOCALAPPDATA%\Programs\Copilot Bridge\
```

安装器创建桌面和开始菜单快捷方式。

Portable 输出仅作为开发诊断用途；它每次启动自解压，不是正式 release
channel。

### 打包 Runtime 组件

安装版 App 打包：

```text
官方 GitHub Copilot runtime
Bundled Node runtime
copilot-sdk-proxy
Electron renderer/main/preload code
```

App 使用 bundled Node 启动解包后的 proxy dependency，不依赖用户单独安装
Node 或全局 Copilot CLI。

### 当前 App IPC

Renderer-to-main IPC：

```text
profile:status
profile:activate
profile:prepare-bridge
profile:acknowledge-restart       # 兼容路径，不是预期主页流程
system:restart

oauth:start
oauth:cancel

bridge:status
bridge:start
bridge:restart
bridge:models

settings:get
settings:update
```

安全边界：

```text
contextIsolation: true
nodeIntegration: false
```

### 当前 App 状态

持久化设置：

```text
%APPDATA%\copilot-bridge-app\settings.json
```

示例：

```json
{
  "backendModel": "gpt-5.6-terra",
  "reasoningEffort": "high"
}
```

Profile switch journal：

```text
%APPDATA%\copilot-bridge-app\CopilotBridge\profile-switch.json
```

journal 保存 intended profile 与 prior user-level `CODEX_HOME`。当前产品流
仍需要强化：当 Original 原先是非空自定义 `CODEX_HOME` 时，必须真正恢复
该 prior value，而不是把 Original 一律当作 unset。

## 当前 BridgeManager

实现文件：

```text
copilot-bridge-app\electron\bridge-manager.ts
```

当前能力：

- 生成独立 app-owned proxy config；
- 用 bundled Node 启动解包的 `copilot-sdk-proxy` CLI；
- 显式使用 bundled 官方 `copilot.exe`；
- 在 localhost 8787 以 Codex provider mode 启动；
- 最多轮询 30 秒 health；
- start / stop / restart child process；
- 获取真实 SDK model / capability 数据；
- 持久化 backend model 和 reasoning effort；
- 防止旧 child exit event 覆盖新 restart 的 status。

当前未具备：

- TLS；
- remote clients；
- client authentication；
- 多用户/多设备；
- 审计日志；
- 动态本地端口；
- 处理其他进程占用 8787；
- 正式 diagnostics UI 中展示 process output。

## 当前 OAuth 方案

实现文件：

```text
copilot-bridge-app\electron\copilot-auth.ts
```

App 调用：

```text
official-copilot-runtime.exe login
```

当前行为：

- 使用官方 device-code OAuth；
- 只解析公开 device code 和 verification URL；
- 自动打开浏览器一次；
- 不读取、复制、显示或保存 GitHub OAuth token；
- 通过 IPC 报告 start/wait/completed/failed。

当前限制：

```text
Fresh device-code login 尚未在隔离 credential store 中完成 E2E 验收。
已有登录状态下的 app-managed Bridge 启动已通过。
```

## Remote Server Mode：必须新增的设计

现有 local Responses / Tool Bridge 协议可以复用。Remote server 必须新增
当前本地模式不存在的安全层：

```text
Client app / ChatGPT Desktop
  -> HTTPS + Bridge client authentication
  -> Remote Gateway
  -> server 上的官方 Copilot SDK/runtime
  -> GitHub Copilot
```

### Remote Gateway 职责

| 层 | 必需能力 |
| --- | --- |
| TLS | 仅 HTTPS，不允许公开 plain HTTP |
| Client auth | 独立 Bridge client credential、OAuth、设备注册、mTLS 或等价机制 |
| Server Copilot auth | 官方 GitHub Copilot runtime 登录状态只保存在服务器 |
| Session mapping | 按认证 client/device/user 隔离 SDK sessions |
| Streaming | 保留 Responses SSE、cancellation、disconnect 行为 |
| Tool correlation | 保留 `call_id` 与同一 session function output continuation |
| Rate limiting | 按设备/用户限流，保护服务器端订阅 |
| Revocation | 独立撤销设备/client，不影响 GitHub 凭据 |
| Logging | 默认脱敏 token、prompt、代码、tool output |
| Audit | 如需要，记录 metadata-only connection/session event |
| Health | 暴露认证后或内部 health 状态 |

### Remote Tool 执行规则

当前产品模型应保持：

```text
Remote server：Copilot 推理与 session 管理
Local ChatGPT/Codex：filesystem、shell、patch、npm test 执行
```

不要把 remote server 设计为默认执行客户端 filesystem/shell 命令的服务。
若需要 remote execution，必须另行设计明确的 remote-agent 产品和安全模型。

### 推荐 Remote API

尽量保留现有协议：

```text
POST /v1/responses
GET  /v1/models
GET  /health
```

新增受保护的 app API namespace，例如：

```text
GET  /bridge/models
GET  /bridge/status
POST /bridge/devices/register
POST /bridge/devices/revoke
```

`/bridge/models` 可保留为 app-only endpoint。不得把未认证 diagnostic
endpoint 暴露给公网。

### Remote 认证分层

必须存在两套独立凭据：

```text
Server -> GitHub Copilot：
  server 保存的官方 Copilot OAuth / credential-store 状态

Client -> Your Gateway：
  Bridge 专用 device/client credential
```

不得向客户端发送 server 的 GitHub OAuth credential。不得用单个公开静态
API key 作为多设备服务器的唯一长期安全边界。

## 关键文件

### App

```text
copilot-bridge-app/electron/main.ts
copilot-bridge-app/electron/bridge-manager.ts
copilot-bridge-app/electron/profile-store.ts
copilot-bridge-app/electron/copilot-auth.ts
copilot-bridge-app/electron/settings-store.ts
copilot-bridge-app/electron/preload.cts
copilot-bridge-app/src/App.tsx
copilot-bridge-app/src/bridge-api.d.ts
```

### Proxy

```text
upstream-copilot-sdk-proxy/src/cli.ts
upstream-copilot-sdk-proxy/src/copilot-service.ts
upstream-copilot-sdk-proxy/src/server.ts
upstream-copilot-sdk-proxy/src/providers/codex/provider.ts
upstream-copilot-sdk-proxy/src/providers/codex/tool-bridge.ts
upstream-copilot-sdk-proxy/src/providers/shared/model-resolver.ts
```

### 证据与产品文档

```text
docs/MASTER_PRD.md
docs/UI_UX_PRD.md
docs/DEVELOPMENT_STATUS.md
docs/ROADMAP.md
docs/BLOCKERS.md
docs/DECISIONS.md
docs/acceptance/phase-0.md
```

## 不可违反的约束

```text
不得重写 Responses provider。
不得重写 Tool Bridge。
默认不得在 server 执行 client filesystem/shell 工具。
不得向公网暴露 Original .codex 数据、GitHub OAuth token 或本地 Bridge
diagnostic endpoint。
不得使用真实 .codex 物理目录 rename 作为 Profile backend。
不得删除、移动、logout 或覆盖 Original Profile 数据。
不得以 Agent 的模型自述作为 backend model routing 证据。
```

## 下一阶段建议问题

以下是规划问题，不是已完成的设计决策：

1. Remote mode 是严格的“一个个人账号 + 多台个人设备”，还是未来支持多个
   用户？
2. client authentication 应使用设备注册、OAuth、mTLS，还是组合方案？
3. server 的 GitHub Copilot credential 如何保存、备份和撤销？
4. remote SDK session 如何映射 client/device/thread identity？
5. 使用哪种 reverse proxy 与证书自动化方案终止 TLS？
6. 需要哪些 rate limit、inactivity timeout、设备撤销流程？
7. ChatGPT Desktop 直接连接 remote endpoint，还是由本地 desktop helper
   负责 remote tunnel / proxy，同时保留本地 tool execution？
8. 如何避免 remote server 使用方式违反适用的订阅条款或账号共享限制？

# Copilot Bridge

Windows 桌面应用，用于让 ChatGPT Desktop 在原账号环境与 GitHub Copilot
环境之间切换。本地 GitHub Copilot 路径不要求注册 Cloud 账号。

## 当前能力

- 支持 ChatGPT Desktop 原账号环境与 Copilot 环境切换。
- Bridge 环境使用独立的会话和工作区状态。
- 支持 GitHub Copilot 连接、真实模型列表、模型选择与推理强度选择。
- 支持本地 Bridge health 检查与 Responses / Tool Bridge 工作流。
- 切换环境后会显示"待生效"；请保存工作、退出 ChatGPT，手动注销并重新
  登录 Windows，再打开 ChatGPT 以继承新的 `CODEX_HOME`。应用不执行自动
  重启或注销。

## 安装

使用 Windows 安装程序：

[下载 Copilot Bridge Setup 0.1.0.exe](https://github.com/mdxz2048/copilot-bridge-app/releases/download/v0.1.0/Copilot.Bridge.Setup.0.1.0.exe)

安装器会创建桌面与开始菜单快捷方式。正式日常使用推荐安装版，不推荐使用
portable EXE。

> 安装器作为 GitHub Release asset 发布，不提交到 Git 仓库。
>
> 上述链接是已发布的 0.1.0 安装器；下列"开发中"改动尚未生成并发布最新
> NSIS 包，不应将旧安装器视为本轮功能验收结果。

## 变更记录

### 开发中（未发布）

- 首次引导仅在认证、服务及模型就绪且设置保存成功后完成；本地
  GitHub Copilot 可不注册 Cloud 账号独立使用。环境切换待注销生效期间
  保持提示，失败可见，不再展示会调用拒绝执行的 Windows 重启按钮。
- Cloud 注册后无有效套餐时明确显示"未开通/待管理员开通"，可前往网站
  账户中心查看测试开通说明；TEST 模式没有网站 URL 时解释原因并保留
  重试登录。网站二维码仅为测试占位，不收款也不会自动开通，需管理员
  人工处理。
- 邀请详情支持复制邀请码、在可信站点可用时复制注册链接，并反馈复制
  成功/失败；注册不即时发奖，资格和点数以服务端记录为准。
- Modal/Sheet 提供初始焦点、Tab 留在弹层、关闭后恢复焦点和 dialog 语义；
  亮/暗/跟随系统主题即时切换并持久保存；已登录 Cloud 回到前台时节流
  刷新账户、订阅、余额和用量，不增加本地免 Cloud 登录路径的前台请求。
- 限制 Copilot Bridge 为单实例运行；重复启动时聚焦现有主窗口。
- 在底部状态栏显示低干扰版本号。
- 新增 Windows AppX / Microsoft Store ChatGPT Desktop 检测。
- 新增官方 Microsoft Store 安装入口与 `winget msstore` 安装流程。
- 新增 Original Profile 的 `UNINITIALIZED`、`READY`、`CUSTOM` 状态。
- 新增 Custom `CODEX_HOME` 保存与恢复测试。
- 新增契约化 Cloud 模式：集中式 `CloudClient`、Windows Credential Manager
  TokenStore、稳定随机设备 UUID、Server 模型目录、账号与服务 UI，以及
  localhost Remote Bridge。
- 早前 Cloud Mock E2E 曾覆盖登录、设备、订阅、用量、JSON/SSE Responses、
  read/edit/shell 本地工具 continuation 和错误状态。Cloud Base URL 通过环境
  配置注入；现有 Local Copilot 与 Tool Bridge 保持可用。本轮没有运行会
  写 Windows PasswordVault 的完整 Cloud E2E harness。
- 已适配冻结的 Server Contract `2.2.0`，包括 Shadow billing、Wallet、
  Referral、Device、Provider Catalog 及 Copilot 稳定错误码。
- Responses 完成后会自动核对 Settlement 并刷新 Wallet/Usage；断线或缺失
  final frame 时按 Request/Response ID 恢复结算状态。
- 已接入 Client Config、维护/最低版本状态、Release 检查和 Server Usage
  History；普通用户界面不展示 Token 计量字段。
- 新增 Desktop UI/UX V2：独立的 ChatGPT Bridge 总开关、轻量账户状态、
  Provider/Model 分层、服务切换确认、模型与推理强度主界面操作、详细设备
  流程和 760×560 紧凑窗口。
- Wallet、邀请奖励、设备和 Provider 数据均由 Server 返回；客户端不计算
  点数、订阅或奖励。网站/API 已部署最新改动，但 Docker 服务的真实
  Copilot 授权/模型开放与商业付款仍受 Gate 限制，不能据此宣称全量开放。

此前客户端定向回归 **55/55**、`npm run build` 和 `npm run typecheck`
已通过；本轮未重跑真实 Windows 注销/ChatGPT、真实 Cloud 账号、
最新 NSIS 打包与安装验收。

### 0.1.0

- 新增 NSIS Windows 安装程序。
- 新增 ChatGPT Original / Copilot Profile 切换基础流程。
- 新增 Copilot Bridge 生命周期管理：启动、停止、重启、健康检查。
- 新增 GitHub Copilot 真实模型列表与模型选择。
- 新增按模型 capability 显示的推理强度选择。
- 新增中文单列主界面、原生 Windows 标题栏行为和 Bridge 状态展示。
- 内置官方 GitHub Copilot runtime、Node runtime 与已验证的
  `copilot-sdk-proxy`。
- 支持 ChatGPT Desktop 通过 Bridge 调用 Copilot，并由 ChatGPT/Codex
  执行文件、Shell 与测试工具。

## 开发

仓库已包含定制 Proxy 源码与项目文档，不依赖任何隔壁目录。需要
Node.js `22.17.0`：

```powershell
npm ci
npm run typecheck
npm test
npm run package:installer
```

GitHub Actions 会在 Windows runner 上执行相同验证并上传 NSIS workflow
artifact。完整说明见 [GitHub development workflow](docs/GITHUB_DEVELOPMENT.md)。

# Copilot Bridge

Windows 桌面应用，用于让 ChatGPT Desktop 在原账号环境与 GitHub Copilot
环境之间切换。

## 当前能力

- 支持 ChatGPT Desktop 原账号环境与 Copilot 环境切换。
- Bridge 环境使用独立的会话和工作区状态。
- 支持 GitHub Copilot 连接、真实模型列表、模型选择与推理强度选择。
- 支持本地 Bridge health 检查与 Responses / Tool Bridge 工作流。
- 切换环境后需要重启 Windows 或注销再登录，让 ChatGPT Desktop 继承新的
  `CODEX_HOME`。

## 安装

使用 Windows 安装程序：

[下载 Copilot Bridge Setup 0.1.0.exe](https://github.com/mdxz2048/copilot-bridge-app/releases/download/v0.1.0/Copilot.Bridge.Setup.0.1.0.exe)

安装器会创建桌面与开始菜单快捷方式。正式日常使用推荐安装版，不推荐使用
portable EXE。

> 安装器作为 GitHub Release asset 发布，不提交到 Git 仓库。

## 变更记录

### 开发中（未发布）

- 限制 Copilot Bridge 为单实例运行；重复启动时聚焦现有主窗口。
- 在底部状态栏显示低干扰版本号。
- 新增 Windows AppX / Microsoft Store ChatGPT Desktop 检测。
- 新增官方 Microsoft Store 安装入口与 `winget msstore` 安装流程。
- 新增 Original Profile 的 `UNINITIALIZED`、`READY`、`CUSTOM` 状态。
- 新增 Custom `CODEX_HOME` 保存与恢复测试。
- 新增契约化 Cloud 模式：集中式 `CloudClient`、Windows Credential Manager
  TokenStore、稳定随机设备 UUID、Server 模型目录、账号与服务 UI，以及
  localhost Remote Bridge。
- Cloud Mock E2E 已覆盖登录、设备、订阅、用量、JSON/SSE Responses、
  read/edit/shell 本地工具 continuation 和错误状态。Cloud Base URL 通过环境
  配置注入；现有 Local Copilot 与 Tool Bridge 保持可用。
- 新增 Desktop UI/UX V2：独立的 ChatGPT Bridge 总开关、轻量账户状态、
  Provider/Model 分层、服务切换确认、模型与推理强度主界面操作、详细设备
  流程和 760×560 紧凑窗口。
- Custom API、本地模型、剩余点数、邀请奖励与设备凭据已建立客户端接口，
  但在 Server Contract 正式提供前不会在生产环境伪造或启用。

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

```powershell
npm install
npm test
npm run package:installer
```

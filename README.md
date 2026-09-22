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

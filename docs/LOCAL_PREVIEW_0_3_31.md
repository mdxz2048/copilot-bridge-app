> 本文保留本地预览阶段记录。后续正式版本统一为 0.3.31，发布状态见 [0.3.31 发布记录](RELEASE_0_3_31.md)。

# 0.3.31 本地预览安装

2026-10-29，用户明确要求服务端本地预览、App 本地安装、先不上传。本次没有执行任何远端上传、部署、版本发布或 Git 推送。

- 服务端：Web `http://127.0.0.1:3310`，API `http://127.0.0.1:3311`，PostgreSQL 绑定 `127.0.0.1:55432`，使用独立 Docker 容器和持久卷。全部迁移包含 0018 已应用到本机 `bridge_local_preview`，不导入生产数据或上游凭据。
- 合成数据：5 个账号，普通用户 24 条设备区间消费、充值/奖励余额与反馈；服务端通过真实 API 保存操作。账号密码保存在当前任务 `work/local-preview-0.3.31/预览账号.txt`，不进入 Git。
- App：`0.3.31`，独立产品 `Copilot Bridge Preview`，appId `com.copilotbridge.desktop.preview`，当前用户目录 `AppData/Local/Programs/Copilot Bridge Preview`。桌面快捷方式 `Copilot Bridge 本地预览`。正式版仍运行，未覆盖或重启。
- 预览包使用独立 `electron/preview-main.ts`，固定连接本机 API/Web，独立 `CopilotBridgeLocalPreview` 用户数据、系统凭据命名空间及 CODEX_HOME，默认不开机启动/不自动启动代理。普通安装包入口仍是 main.js，生产默认域名不变。
- 本机恢复入口为桌面 `Bridge 服务端本地预览`，调用当前任务 `work/local-preview-0.3.31/start-local.ps1`。运行密码和数据库密钥仅在 Cloud `.local-preview` 中，该目录已忽略。

## 包与安装验收

本地 NSIS 安装包：`release-local-preview/Copilot Bridge Preview Setup 0.3.31.exe`，343677833 bytes，SHA256 `621d12f2686ab1e235239604b0a79dc4f7dacb82d5bc11528bececd67de90425`。安装退出码 0，已安装 EXE ProductVersion `0.3.31.0`。

安装后 app.asar 的 58 个 renderer/main 构建文件与当前输出逐字节一致；图标、gateway helper 和 Node runtime 外置资源一致。独立预览元数据、入口、本机域名及隔离目录已核对。app.asar SHA256 `33d5132ccf3e54f3d1ecb9f56ec9e3640e999b00806c8637720c604ca5f1c173`。

初次 Electron 下载探测 GitHub 超时，改用本机已安装的相同 Electron 44.4.5 分发包完成打包，没有降低版本或绕过内容验证。

## 实际运行验证

- 实际本机 Web/API/PostgreSQL：网页登录、用户列表、用户详情、反馈状态更新、24 条消费分页通过，无浏览器脚本错误；未使用 API 路由模拟。
- 实际安装 Electron：登录本机用户、查看扣费第二页、提交反馈、本机管理员查询并改为已处理、App 我的反馈显示已处理，整条链路通过；未使用 IPC 模拟。
- 47 项账户/Cloud/仓库回归通过；本次构建与类型检查通过。前一阶段 App 全量 300 项与 Cloud 隔离 DB 35 项记录仍在对应候选文档中。
- 原正式版 Bridge 主进程仍运行；官方 `.codex/config.toml` 前后哈希一致。未关闭官方客户端、未重启 Windows，未运行真实模型生成。

用户可以通过本机后台或桌面快捷方式查看。工具策略拒绝自动打开默认浏览器，因此交付使用可点击本地地址，不宣称已代用户打开浏览器。

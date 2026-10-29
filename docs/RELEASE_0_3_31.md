# 0.3.31 — 消费记录、意见反馈与用户管理

正式发布版本为 **0.3.31**，接续线上 0.3.30。本次开发过程中独立 Preview 曾使用 0.3.32；该编号仅属于本机预览证据，不是线上正式发布版本。

账户中的「消费记录」按设备 → 逐笔模型调用 → 扣费解释展示，支持今天/近 7 天、分页、设备改名、本机标识及折叠计费依据。真实实扣、部分扣款、金额待核对和历史汇总分别解释；有完整依据才展示输入/输出费用分项。充值、奖励与管理员调整保留在单独的「余额记录」。意见反馈支持提交、我的反馈及处理状态；后台增加反馈工作台，并重做用户列表和状态/余额/套餐/模型/设备五类管理操作。

安装包使用正式产品 `copilot-bridge-app`、正式 main 入口及生产 Cloud。包内 59 个构建文件与最新 dist、外部资源逐一校验一致。安装包 343,680,750 字节，SHA256 `d9d4eca147b8cce7f6653162ea864f7757139cd4c8021f85a71555ee12cc830a`。发布后实际 UpdateManager 从 0.3.30 检查到 0.3.31，通过公网 HTTPS 下载和 SHA256 校验达到 READY，没有触发安装或退出当前 Bridge/官方客户端。

域协议为 2.11.0，桌面握手仍为 2.3.0；最低兼容客户端仍为 **0.3.28**，普通发布不要求兼容旧版强制升级。计费、模型转发、登录及模式切换契约不变。

验证：App 全量 301 项、后续界面回归 61 项、正式版本针对性 48 项；Cloud 210 单元、45 独立本地 PostgreSQL 集成（含旧版门禁、反馈和消费）、Web 19、contract 10。实际安装的独立 Preview 已验收深浅主题、小窗口及真实 IPC/本机 DB。正式安装包验证与线上更新验证见 `evidence/release-0.3.31/`。本次没有再次发起真实付费模型请求，未用历史安装包重跑官方 GUI 的全部生成/工具链路。

服务端 API/Web 与反馈迁移 0018 已部署；Postgres/Caddy 容器不替换，等待当前 API 进行中的模型请求为零后更新。正式版安装未被本次维护自动替换。预览数据和本机运行配置不上传。

Git 沿用本次工作所在 `codex/ued-v3-1-implementation` 分支，提交源码、协议和脱敏验收证据，不提交安装包、凭据或真实用户截图。

Public production browser verification passed for the redesigned user list, all five management categories and the feedback workbench. No account changes or script errors occurred; real-user screenshots are excluded from Git.

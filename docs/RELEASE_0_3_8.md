# 0.3.8 两种使用模式

开启主开关使用 Copilot Bridge Cloud；关闭主开关恢复用户自己的 ChatGPT。移除首次服务选择、GitHub Copilot 和自有 API 接入选择入口。Cloud 内部模型和思考方式选择保留。

点击开关先确认目标模式，取消不修改配置。开启时必要的 Cloud 登录成功后继续已经确认的切换；普通账号登录不自行开启开关。关闭不依赖 Cloud 登录或在线状态。切换成功后提示重启 ChatGPT，可以立即重启或稍后操作；重启失败保留待生效状态和重试入口。安装 ChatGPT 仍是开启前提。

本期只收敛桌面使用流程，不改变 Responses 转发、计费和失败反馈机制。保留现有原账号会话、工作区和配置恢复方式。

## 验证与发布

App构建和191项测试通过；实际App渲染页面在模拟IPC浏览器中完成40张浅色/深色、多尺寸截图及切换、登录续接、模型与思考保存验证。真实GatewayProfileStore在临时目录反复8次切换并保留原配置和会话文件；文件访问失败后保留快照，修复后可重试。切换失败不能展示成功；首次使用标记保存失败与连接切换结果分开提示。当前本机旧安装曾被服务器最新版准入拒绝，补齐友好的更新提示与异步模型读取错误处理。

正式Windows stable 0.3.8已发布；完整公开自动下载校验SHA并进入READY，同设备旧037准入426、038可读取模型已通过。服务器仅保留最新Bridge安装包；Cloud API/Web代码未变，本期无需镜像重建。官方宿主真实重启没有执行，不能将模拟UI/隔离文件验证视为该场景已验证。

release `80525ec0-a8d4-4742-afe4-85f3ad0f1179`，SHA256 `1e095d6f6af035abd6e95f99adaf1e348d49b9ce10648135d80655e38a5bff50`。[安装包](https://ai.mddxz.top/api/v1/releases/files/80525ec0-a8d4-4742-afe4-85f3ad0f1179)。安全证据：[模式验收](evidence/0.3.8-two-modes.json)、[包内容](evidence/0.3.8-package.json)、[发布](evidence/0.3.8-release.json)、[同设备升级](evidence/0.3.8-latest-upgrade.json)、[完整下载](evidence/0.3.8-public-update.json)。

# Copilot Bridge 0.3.7 大请求与长生成

日期：2026-10-12，Asia/Shanghai。状态：0.3.7正式发布，生产入口/反馈统计、同设备升级与完整公网下载SHA/READY通过。本期修复写文件请求在公网nginx被默认1MiB限制拒绝、短代理/模型等待时间与长任务不匹配的问题，不新增聊天、工具执行器或Agent循环。

## 目标行为

本地Responses正文上限64MiB（67108864 bytes），超限HTTP413 `PAYLOAD_TOO_LARGE`，无需Windows重启。Cloud/代理Responses入口对齐64MiB，JSON解析与并发仍有额外内存开销，因此不是64MiB进程内存上限，也不承诺模型支持任意64MiB内容。

Responses客户端等待70分钟，对应Cloud单次模型生成total65分钟、idle5分钟；connect保留provider的有界连接时限。控制请求继续使用独立短等待，用户取消不重发生成POST。上述参数已落地并通过回归，不代表真实小时GUI已测。

工具运行由官方宿主决定，不按单次模型请求total判断整个任务时长。完整上下文续接不依赖一小时Cloud历史缓存，单纯引用旧ID仍有缓存/归属边界。大代码和长工具暂停回归不等同于真实小时命令、原WordGUI或全部任务成功。

Cloud sessionTTL2小时，在请求开始/完成刷新；工具续接RPM豁免65分钟/8步，超过仍可按正常RPM继续，不是工具时限。RUNNING额度和并发跨周期继续占用，未知费用审核和UNPAID保护保留。

输出预算取模型`maxOutputTokens`（未配置才32768回退）、用户`max_output_tokens`和可用资金预算最小值，取消统一人为32K cap；仍受模型能力和余额约束，不是无限输出。

失败报告增加可选 `requestStats.desktop/forwarded`：实际 `bodyBytes`，可选 `declaredBodyBytes/bodyLimitBytes/inputCount/toolDefinitionCount/toolCallCount/toolOutputCount/toolArgumentBytes/toolOutputBytes`。统计在诊断截断前产生，不包含正文；未解析正文只记录已知值。诊断仍保持96KiB与加密队列，不截断实际转发，也不重试模型请求。旧0.3.6报告不补造原始字节。

## 当前验收

Root确认生产旧nginx1m/120s造成真实413 HTML；新exact Responses64m/read4200s/body300s/send300s/bufferingoff与JSON413已配置，nginx-t/reload和公网2MiB无鉴权→401通过，无模型消费。该入口证据不代表有效大正文模型调用或小时任务；客户端发布与升级由下方独立证据确认。

App完整186/186；随后最后failure getter guard定向21/typecheck/build PASS，未再次执行补丁后完整186：真实本地HTTP→fakeCloud64MiB正文逐字一致，64MiB+1返回413且无上游POST，HTML413中文提示/摘要与requestStats通过。Cloud117单元/typecheck/build、contract10及真实隔离DB22通过，其中跨周期3RUNNING继续保留预留并阻止上游。这里fakeCloud不等于实际供应商模型调用。

公网20MiB签名未知模型经本地→nginx→Cloud返回权限403，原始/转发20MiB统计入库PASS，无付费模型/AIRequests/账本变化；不是有效供应商生成。公开声明64MiB+1、仅发送{}触发前置JSON413验证通过。API新image fdd40dfd14f8已部署，无需迁移；安装包20项检查、正式发布、旧036426与同设备037模型可用、完整公开下载SHA/READY通过；Web未改未重建，原036管理界面展示stats JSON。测试四条报告与设备已清理，原用户413反馈保留。Cloud产品/运维/验收文档分别为`docs/product/LONG_REQUESTS_0_3_7.md`、`docs/operations/NGINX_RESPONSES_0_3_7.md`和`docs/acceptance/LONG_REQUESTS_0_3_7.md`。Git记录由Root最终发布报告维护。

诊断采集自身异常必须隔离，不能阻断模型请求；大文本脱敏栈溢出与最初nginx413是不同层问题，最终回归覆盖采集/异常getter保护。


## 发布记录

Windows x64 stable 0.3.7，release `78847be8-e9d6-4640-b332-b50a71c42625`；342849360 bytes，SHA256 `88faeb04a455586973fe802a787860dc71915a9c99c23cbdbff5692f15197e64`。[公开安装包](https://ai.mddxz.top/api/v1/releases/files/78847be8-e9d6-4640-b332-b50a71c42625)。安全证据：[包内容](evidence/0.3.7-package.json)、[发布](evidence/0.3.7-release.json)、[同设备升级](evidence/0.3.7-latest-upgrade.json)、[完整下载](evidence/0.3.7-public-update.json)。Git提交由Root最终报告记录。

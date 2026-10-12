# Copilot Bridge 0.3.6 失败自动反馈

日期：2026-10-12，Asia/Shanghai。状态：0.3.6正式公开发布，真实反馈/API后台闭环、同设备升级及完整公网下载SHA验证READY通过。Root 控制版本、构建、部署和发布；本文件不改0.3.5历史证据。

## 功能与协议

Cloud AI 请求失败时，Bridge 在后台反馈桌面请求、转发请求、HTTP回复/近期流事件的脱敏片段，以及错误阶段和 trace/request/response/thread 编号。服务端根据认证账号补邮箱和设备版本，管理员在“失败反馈”查看。正常会话不上传诊断正文；用户主动取消不作为故障。

上传为签名设备请求 `POST /api/v1/diagnostics/failures`，包含 `id`、`ownerUserId`、`occurredAt`、`appVersion`、`traceId`、可选关联编号、`stage`、`error`、`request.desktop/forwarded`、`reply.http/events`、`truncated`。阶段为 `local_validation/cloud_http/cloud_transport/stream_failed/stream_incomplete/stream_disconnected`；服务返回 `{id, received:true, duplicate}`。邮箱由服务端认证补齐，不在客户端自报身份。

反馈只处理故障诊断，不重发模型 POST、不执行工具、不增加模型调用费用。报告包含用户自然语言/工具或文档文本的有限片段，不能称完整抓包。API凭证、Cookie、密钥、二进制/Base64附件、加密推理等移除，仍不承诺自然语言绝无个人信息。诊断脱敏、截断和入队均不修改原模型正文。

客户端报告最多96 KiB，输入/转发各自有界，最近流事件最多32个；加密 outbox 最多20条、2 MiB、7天，无法使用系统加密时只在内存保留。每条绑定产生失败时的 owner，登录其他账号不上传旧报告。反馈重传保持原报告 ID，失败退避，上限一小时；400/403/409/413/422终止重试，其他失败留待后台重传，不影响原会话结果。

服务端接口128 KiB，AES正文保存14天，全局1,000条/128 MiB加密载荷；每用户锚定一小时窗口最多30条新报告，重复ID不计数，删除不能重置限额。详情仅管理员可读；删除须同源并保留无正文审计。服务端最终协议/验收见 Cloud `docs/product/FAILURE_FEEDBACK_0_3_6.md`、`docs/acceptance/FAILURE_FEEDBACK_0_3_6.md`。

## 长代码与长命令

诊断大小限制不作用于原生模型转发。新增回归核对100 KB工具输出、模拟超过一小时暂停后的完整上下文，避免诊断摘要反过来截断代码。完整上下文续接不依赖Cloud一小时历史缓存；只有引用ID而无完整历史的请求仍受缓存/归属规则约束。

600秒是单次模型生成请求总时限，不是命令运行时间。工具运行由官方宿主决定，Bridge没有执行器或Agent循环。长命令是否允许、最大输出/上下文、供应商能力和宿主策略仍各有限制，不能承诺所有代码或命令都成功。既有Office双模式12次固定外部工具验证也不能替代用户原始Word桌面流程；真实官方GUI/UAC安装与host重启本期未实测。

## 当前验收与发布门槛

| 项目 | 当前证据 |
| --- | --- |
| App失败采集、正常/取消、账号隔离、加密队列、签名、大输出长暂停 | PASS：完整179/179、最后生命周期补丁定向15/15、typecheck/build；不能写完整180 |
| Cloud存储/权限/限额 | Cloud115单元/typecheck/build、contract10与真实隔离DB22通过；API/Web部署及0011迁移成功 |
| 管理站交互 | typecheck/build及真实组件模拟浏览器PASS；真实生产后台浏览器筛选/详情/删除、390px无溢出通过 |
| 无付费生产合成故障闭环 | PASS：四阶段合成失败自动上传、邮箱设备关联、脱敏/AES/幂等，无模型调用/账本变化；测试记录清理、设备撤销 |
| 安装包/公开发布/同设备升级/完整公网下载READY | PASS：正式发布、旧035426、同设备036模型可用、完整公开下载SHA校验READY |

Windows x64 stable 0.3.6已发布，release `33cc592f-06de-46b5-9121-c2745ade5cf7`，342848436 bytes，SHA256 `eb278d71eaa0b1e1e3f9ec4a2bf4e828216738684b4965ee5e4c3e1ba456c094`。[公开安装包](https://ai.mddxz.top/api/v1/releases/files/33cc592f-06de-46b5-9121-c2745ade5cf7)。安全证据：[包内容20项检查](evidence/0.3.6-package.json)、[发布](evidence/0.3.6-release.json)、[同设备升级](evidence/0.3.6-latest-upgrade.json)、[完整自动下载](evidence/0.3.6-public-update.json)。完整生产反馈与后台证据见Cloud验收文档；四类生产阶段为local_validation/cloud_http/stream_failed/stream_disconnected，incomplete只计回归覆盖。Git提交由Root最终发布报告记录，不在文档写尚不存在的SHA。

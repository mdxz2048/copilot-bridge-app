# 0.3.9 模型请求次数不限

Cloud取消模型请求以及后台模型/账号/用量查询的IP、账号、设备和套餐RPM限制，工具续接不再有8次计数限制。账户页展示“模型请求次数不限”。保留余额、周期消费额度、并发保护及认证权限，维持Cloud/自己的ChatGPT两种模式与更新按钮。

App191项测试通过，Cloud119项单元及真实隔离DB22项通过；安装包、公开下载及正式发布结果见最终发布证据。没有在验收中重启官方宿主或执行用户原始Python网页任务。

## 正式交付

生产24秒内700次状态查询PASS，模型列表仍正常，未鉴权模型入口401，无付费模型调用且余额未变。0.3.9正式发布，公开安装包完整自动下载和SHA校验进入READY；同设备038升级039通过，账户返回accountRpm/deviceRpm=0并可读取模型。服务器仅保留最新Bridge安装包，官方离线安装包保留。

release `af00e895-8377-4d15-9344-89bf20c4a8ce`；SHA256 `527e7b44f518bfcd696e68fb0e87b2352f5d73654e2a9c843ecceaf99f89a1be`。[安装包](https://ai.mddxz.top/api/v1/releases/files/af00e895-8377-4d15-9344-89bf20c4a8ce)。证据：[测试](evidence/0.3.9-tests.json)、[包内容](evidence/0.3.9-package.json)、[生产查询](evidence/0.3.9-production-read.json)、[同设备升级](evidence/0.3.9-latest-upgrade.json)、[完整下载](evidence/0.3.9-public-update.json)。真实官方宿主和用户原始网页任务未在验收中重跑。

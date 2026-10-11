# App 0.3.2 custom wrapper SSE增量合同

2026-10-11：修复完成，完整141/141 tests（新增4项兼容回归（0.3.1 baseline137），含Unicode surrogate边界与缺arguments.done补齐）与build PASS；正式发布/真实Cloud固定工具回路PASS，Updater最终READY/Git待Root。Cloud原生协议/hash不改，0.3.1文档历史不改。

Root已复现custom wrapper function_call added arguments=''被desktopEvent提前JSON.parse，SyntaxError Unexpected end of JSON input length28，与本机trace10f2b2ab 06:42:52 LOCAL_ERROR吻合。

每response维护独立SSE状态，按item/call索引累积wrapper arguments；added不解析partial JSON。合法已确认input字符串映射custom input delta；完整done后映射input done/item done/completed，保留namespace/alias。普通function/原生apply_patch保留原协议。

坏finalargs单一SSE event:error/type:error/code:INVALID_SERVER_RESPONSE，安全错误/requestId，不裸断TCP、不泄私密参数、不把失败当completed。响应隔离、并行items、转义Unicode、空input、分片和终止顺序必须测。单次响应映射修复不增加POST/重试/重复工具执行/额外账单。

版本0.3.2走现有自动更新/latest-only；最终App tests/build/asar/package/hash已经通过；public下载最终READY待Root完成。Cloud产品方案docs/product/IMPLEMENTATION_0_3_2.md与门槛docs/acceptance/RELEASE_0_3_2_GATE.md为交付范围。

官方Word桌面拖拽/预览不因此PASS；host工具policy阻止边界保留，不绕过。真实UAC安装和host重启未执行。0.3.1固定应用WordAPI证据只证明业务工具与Cloud模型理解/续接。

## 正式发布与生产证据

0.3.2 release `efeec65f-e20f-4a02-9679-d9dffe96bff1`已published；[安装包](https://ai.mddxz.top/api/v1/releases/files/efeec65f-e20f-4a02-9679-d9dffe96bff1)，342838390bytes，SHA256 `3ad9af20d3197a04eef0de8427e53fc938f80f40d13ab53bb5843539c1962563`。

[生产custom SSE证据](H:/8_code/CopilotBridgeCloud/docs/acceptance/evidence/0.3.2-custom-sse.json)PASS：normal2POST+thinking2POST各完整同thread工具回环无retry；额外探索thinking1POST因模型未逐字复制预设fixture但已completed/SETTLED，非SSE转换失败。总5付费POST均SETTLED45点¥0.0045。上游wrapped.input与Local input delta/done/completed逐字相同，namespace/Unicode/escape无wrapper泄漏；测试设备已撤销。

旧0.3.1请求426；0.3.2 refresh同UUID/P256版本登记后models可用PASS。全量141/141、build/ASAR13 PASS。真正验证的是官方请求形状HTTP SSE→Local RemoteBridgeServer→生产Cloud→DeepSeek；本轮官方host工具policy仍BLOCKED，不能宣称官方runtime执行、拖拽Word或DesktopUI完整成功。Updater完整下载最终READY和Git两库main commit由Root补真实证据。
发布收口：公开 UpdateManager 已完整下载 342838390 bytes，SHA256 验证通过并进入 READY（0.3.2-public-update.json）；两库 Git 最终提交及服务器源码同步记录由 Root 的 architecture-final-release-032.json 保存。

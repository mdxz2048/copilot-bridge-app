# Copilot Bridge 0.3.5 功能方案与验收

日期：2026-10-12，Asia/Shanghai。状态：App165/165全量/build与Cloud111unit/build/typecheck/真实隔离DB21通过；已公开发布，生产Office固定工具生成/重读与同device升级PASS，完整公网下载/sha256/UpdateManagerREADY通过。App Agent负责安装/重启，Cloud Agent负责生成超时，Root负责构建、部署、真实验收和Git。仅修现有工作流，不新增聊天应用、工具执行器或Agent loop；0.3.4历史证据不改。

## 本期行为

| 用户场景 | 目标行为 | 验收状态 |
| --- | --- | --- |
| 未安装官方ChatGPT | 优先启动Store安装；检测安装状态，没有可观察进度/无法完成时自动转服务端官方离线包安装 | App165回归PASS；真实host安装未执行 |
| 安装进度 | 显示当前阶段、下载进度、校验/安装/注册检测及可读错误；超时不无限等待Store | App165回归覆盖非零递增progress，真实UAC未执行 |
| Bridge开/关切换 | 保存连接配置后只重启官方客户端一次；退出竞态/重复点击不导致Bridge退出或重复启动 | App165回归覆盖可信backend rescan/退出/启动确认；当前host未重启 |
| 文档/代码长生成 | Cloud采用有边界的active/idle/overall计时，不被统一60s硬截止误杀持续输出 | connect60/idle120/total600，Cloud111回归PASS；固定工具Office生成12/12通过，真实>60s未测 |
| 失败回传 | 上游response.error等嵌套错误保持安全类别/请求ID，不能把真实失败写completed或裸断TCP | nestedresponse.error/requestId/phase回归PASS |

“Store无进度”必须定义为可观察状态在限定时间内未推进，明确计时/转移条件；不能把自动打开商店当完成安装。离线回退复用固定manifest、size/SHA256、白名单MSIX/license提取、Windows签名/identity、App自有安装脚本/UAC、注册detect；不执行ZIP内脚本，不重新设计密钥/设备/财务。

重启复用EncodedCommand与官方package路径确认，按实际实例退出/启动状态处理。切换与重启保持单次操作状态，幂等防重复；不用注销或重启Windows。重启成功需观察目标客户端实际启动，不以命令返回0冒充成功。

## 文档失败的根因边界

Root生产定位Word失败为GATEWAY_TIMEOUT：Provider统一hard60s计时到期，持续生成仍被abort。它同样可能影响Excel/PPT/代码等长生成，不是仅Word格式/图片能力问题，也不能据一次超时宣称所有附件已支持。新active/idle/overall计时需独立、可追踪、有上限；用户取消立即abort，不自动再发可能收费POST，实际usage/未知费用审核保持。

Cloud详细方案见`docs/acceptance/DOCUMENT_GENERATION_TIMEOUT_0_3_5.md`。具体时限以实现和测试记录为准，本文件不预先承诺无限等待或固定性能改善。

## 验收矩阵

| 场景 | 必要证据 | 当前 |
| --- | --- | --- |
| Store安装 | 成功探测、不推进/失败自动离线回退、可读进度、注册检测 | 165tests覆盖Store未启动→自动offline、child退出handoff；当前host未安装 |
| 离线安全 | 固定manifest/hash/size/签名identity/UAC边界，失败可重试，无重复安装 | 165tests回归PASS；真实UAC未执行 |
| 切换重启 | on/off各一次、重复点击/已退出进程/启动失败/中文错误，Bridge保持运行 | 165tests回归PASS；当前host未重启 |
| 超时 | 无数据active、停流idle、持续输出超过旧60s、overall截止、用户取消分别验证 | 111unit/fake-clockSSE跨60s PASS；固定工具Office双模式通过；真实>60s/用户原始WordGUI未测 |
| 计费/错误 | 每生成1POST、不自动retry；usage正确settled或未知审计；response.error安全终止 | Cloud111/隔离DB21 PASS；生产fixedexternaltool Office12/12 PASS |
| 发布 | 全量tests/typecheck/build/asar、0.3.5包version/bytes/hash、latest-only/同device升级/public READY | 正式发布/18ASARchecks/真实完整download PASS |

## 验收与操作边界

不得自动操作或重启当前正在承载本任务的Codex/ChatGPT host。使用mock/隔离进程验证必须标明，不能推广为真实本机UAC或官方host重启通过。真实官方Word拖入/附件预览仍未验收；固定业务文件读取API和生成测试不能代替桌面完整回路。

本轮沿用用户授权的latest-only服务发布，不新增确认或备份门槛；保留历史账号、设备、不可变usage/账本。实际test/image/安装包/release/publicREADY已落实；Git两库main最终提交由Root汇报。

当前已确认：App165/165全量tests/build、Cloud111unit/typecheck/build、独立Postgres21/21 PASS。安装/restart只读核对实际process并由165tests验证，未执行当前官方host安装或重启。native connect60s/有效生成reset idle120s/total600s，heartbeat不续时、total超时不cool资源；嵌套response.error含requestId/phase。docx/xlsx/pptx双模式固定外部工具生成/重读12/12 PASS；实际用户原始WordGUI与真实>60s未测，已公开发布/同device升级PASS，完整公网下载/sha256/UpdateManagerREADY通过。

## 已部署与真实Office证据

API生产image `94ff69a4b66862c8fcd0747d67028dcb3c437275215a657b9b5d75961ce61472`，source/container hash匹配，publichealth200。

[normal](H:/8_code/CopilotBridgeCloud/docs/acceptance/evidence/035-office-write-normal.json)、[thinking](H:/8_code/CopilotBridgeCloud/docs/acceptance/evidence/035-office-write-thinking.json)、[最终报告](H:/8_code/CopilotBridgeCloud/docs/acceptance/evidence/035-office-write-final.json)：normal/thinking各docx/xlsx/pptx通过固定外部安全工具写文件并重读，总12/12请求native completed、每请求1上游attempt、无自动retry；normal平台扣费¥0.0031、thinking¥0.0037。测试设备已撤销。此为固定外部工具业务生成，不是Bridge产品工具执行器；未验证用户原始WordGUI或真实>60s任务，不把fakeclock长流测试冒充真实长生成。

[旧超时审计](H:/8_code/CopilotBridgeCloud/docs/acceptance/evidence/035-office-timeout-review.json)：原60s Word失败造成reviewblock，既有admin review platform_waived幂等/audit1/remaining0，原finance/ledger不变、不补扣，supplierCostKnown=false由平台承担未知费。

App0.3.5 ASAR全hash PASS；installer342844761bytes，SHA256 `6cca11c5436932a384074d545a1ae65e231ebba6f1ad74d4855b34a1209eec76`。正式publicrelease/同device升级/真实自动升级完整下载READY PASS；本机host安装/重启/UAC未执行。
## 已公开发布与安装回退时限

[0.3.5发布](H:/8_code/CopilotBridgeCloud/docs/acceptance/evidence/035-release.json)已published，release `17946352-c168-46a9-be6f-c8aac0dd1529`；[安装包](https://ai.mddxz.top/api/v1/releases/files/17946352-c168-46a9-be6f-c8aac0dd1529)，342844761bytes，SHA256 `6cca11c5436932a384074d545a1ae65e231ebba6f1ad74d4855b34a1209eec76`。[同设备升级](H:/8_code/CopilotBridgeCloud/docs/acceptance/evidence/035-latest-upgrade.json)PASS：旧0.3.4 HTTP426 CLIENT_UPGRADE_REQUIRED，同device0.3.5 refresh后模型可用，测试设备已撤销。公开完整自动下载342844761bytes、sha256 verified、UpdateManager READY0.3.5 PASS。

Store30秒无非零递增下载进度自动offline；已开始下载后90秒无进度或15分钟总限触发有界回退。Windows真实UAC仍需用户允许，不能宣传无权限静默安装；当前host真实安装/重启未执行。App安装包18项version/关键ASAR文件检查全部PASS，App安全证据docs/evidence/035-package.json。Git最终由Root报告。
最终公网升级证据：Cloud docs/acceptance/evidence/035-public-update.json（已去除私人本机路径），publicLatest/automaticDownload/sha256Verified/READY035 PASS。旧034下载已删除，服务器仅一份latest Bridge安装包并保留officialZIP；Root最终服务器核对和Git提交由最后发布报告记录，不提前写GitSHA。真实本机host安装/重启/UAC与用户原始WordGUI、真实>60s生产任务仍未验证。

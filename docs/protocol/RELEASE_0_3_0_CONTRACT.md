# App 0.3.0 / Cloud Domain 2.5 / Gateway 1.1

日期：2026-10-11；实现与分层验收已完成，部署和生产整链最终证据见Cloud发布门槛。平台设备绑定鉴权未换代，App内部2.3 auth标记不代表Gateway仍是旧窄协议。

权威协议：Cloud `docs/protocol/GATEWAY_REVISION_1_1.md`；权威生成artifact：

- Domain2.5.0 `openapi.v2.json` SHA256 `20269272a7f5e429d73036f96b0fad3dc4e89f126e4bb02f10e40bdc9a8ee6a8`。
- Gateway1.1.0 `openapi.gateway1.1.json` SHA256 `706ee93f9223bb676c0b38cf3736d6c8a52306e09a085c2168901c8e95cb3619`。
- Gateway1.0旧artifact仅历史证据，不是0.3.0请求能力承诺。

App保留完整Responses请求/原生items/events，必要namespace/custom alias仍恢复给官方runtime；原生apply_patch不转function。用户设置`reasoningMode` normal/thinking/auto，Cloud解析真实上游effort，REMOTE不发旧reasoningEffort。客户端仅逻辑模型，无实例/连接选择；默认摘要trace隐藏正文、tool/file/unknownstrings，前序响应snapshot加密且隔离账号。

当前真实证据：App完整build与113/113测试PASS；隔离官方bundled runtime `2e5e00daee91c61d`经LocalBridge/生产Cloud/真实DeepSeek，normal、thinking分别连续两轮执行exec_command并回传工具结果，4次请求均COMPLETED/SETTLED。thinking明文与opaque推理历史完整保留；数据库确认同一实例且新提问/工具续接的rateCounted依次为true/false/true/false。安全shape corpus `test/fixtures/responses/official-runtime-shapes.json`；probe `scripts/official-runtime-probe.mjs`。证据等级为REAL_APP_SERVER，官方Desktop附件/预览/下载卡未观察。

用户不要求旧客户端兼容，启动时自动检查最新版；无害兼容代码保留，历史平台账号/财务不迁移删除。新版安装包由Cloud manifest下发，下载后校验hash再提示安装。

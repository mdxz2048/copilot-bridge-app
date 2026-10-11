# App 0.3.1 当前合同与验收

2026-10-11：0.3.1已published，最终137/137 tests/build/asar关键13files一致。Domain2.5 hash `01d5d70e80919a88e21a3ae38a8bda027ff0e2e44639625a3ff47b1c254d2be8`，Gateway1.1 hash `e522763e7e3cea1a9edc4c9d3aa5b06c047697847b2d9165efef2168c21991f7`。Cloud96unit、另DB20真实、contract10通过。

- 角落绿色下载环，READY用户主动安装，无强制自动弹窗。
- Responses15min/control30s，旧Bridge retry0自动迁移保留外部设置；用户取消不再POST。刷新同UUID/P256登记当前appVersion。
- latest=min0.3.1，旧设备App426 CLIENT_UPGRADE_REQUIRED，admin网站不受限。release volume只最新exe+official，财务不删。
- false原样传Cloud单call安全guard：instructions+8MiB暂存，>1call不释放/failed，真实usage仍收费；不是DeepSeek原生串行。
- Store失败点击下载并安装：固定manifest/size/hash、5entry仅MSIX/license、禁执行ZIP脚本、签名identity、自有EncodedCommand/UAC与注册detect。真实UAC安装未执行。
- EncodedCommand重启竞态/中文修复测试通过，未真实重启官方host。

官方ZIP26.1007.2314.0 x64、944698333bytes，SHA256 `51b8bb192e6dee8da92421605d59b61b4bd424678ac36676a7df95b02bf1d88d`。公开ZIP完整hash及网站双尺寸PASS，入口https://ai.mddxz.top/download#chatgpt。

0.3.1 release `55b65673-0d6e-4283-af85-9bcbacbaa9ba`，342837015bytes，SHA256 `20993362821c42becb8456361bf072038164c6122aac5dd2154093b280d76ea6`。真实UpdateManager0.3.0→0.3.1完整自动下载/hashREADY PASS，outputs/architecture-public-update-031.json。

官方runtime Word读取被hostpolicy阻止，即使GetContent亦拒绝；串行两请求200/COMPLETED/SETTLED只回传policy失败，没有读文档。不能绕policy或标Word桌面完整成功。Cloud固定read_word_quiz只读真实844B合成DOCX：normal/thinking4请求200/completed/SETTLED、隐藏marker+15/54正确、previous恢复thinking明文+opaque、总21点¥0.0021、设备已撤销，业务API理解/续接PASS，不代表官方拖入附件。原始input_file/官方Office-PDF预览UNKNOWN。installer/realupdater/minstrict/versionrefresh PASS；Cloud安全报告docs/acceptance/evidence/0.3.1-manual-word.json、0.3.1-public-update.json、0.3.1-latest-upgrade.json、0.3.1-official-download.json、0.3.1-public-download-ui.json。最终Git两库main当前提交由Root汇报。
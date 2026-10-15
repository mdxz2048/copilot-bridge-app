# 余额拆分与Windows图标（未发布）

## 个人余额

账户详情在可用总余额旁展示正常余额和奖励余额，人民币保留四位小数。正常余额来自充值、管理员增加、套餐额度等；奖励余额为服务端确认的邀请奖励剩余金额。总余额继续用于可用判断，扣款与到期规则由Cloud保持，App不推算奖励也不额外扣钱。服务端兼容新增WalletSummary.regularBalance/rewardBalance，客户端解析并通过balanceBreakdown同步，轮询刷新。服务端没有返回明细时不凭总额猜奖励为零。

## 图标

原来没有配置win.icon、BrowserWindow.icon或Windows AppUserModelId，托盘还使用nativeImage不支持的SVG数据URL。沿用现有蓝色圆环标识提供多尺寸ICO（16/20/24/32/40/48/64/128/256）和PNG；程序PE图标由electron-builder win.icon嵌入。运行时图标通过extraResources复制到resources/icons；打包应用从process.resourcesPath/icons读取，开发态从项目resources/icons读取。窗口和托盘使用同一图标路径，Windows AppUserModelId与build.appId一致。

仅本地打包与Git，未上传安装包、未改线上App版本。已验证EXE可由Windows System.Drawing提取Bridge圆环图标；原生Electron隐藏窗口探测未完成后终止，因此不声称已通过真实任务栏/托盘交互验收，也没有启动完整Bridge或重启当前官方客户端。

## 验证

App227项全量测试无失败或跳过；类型检查与构建通过。新增覆盖HTTP schema保留两类余额、轮询同步、旧服务缺字段的处理。真实App renderer模拟IPC在720/900浅深色验证正常余额、奖励余额、可用总额、无页面异常或横向溢出。打包资源核对证据见docs/evidence/balance-icon-20261015.json。服务端已上线两类余额，旧App继续按总额使用，待未来发布本次App后显示拆分和更新图标。

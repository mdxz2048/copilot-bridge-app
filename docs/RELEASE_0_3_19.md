# Copilot Bridge 0.3.19

## 本次功能

账户概览增加“充值”入口；点击在同一紧凑弹窗内显示用户提供的管理员微信二维码、注册邮箱和联系充值说明。扫码添加管理员并告知邮箱与金额，管理员按现有流程增加余额后自动同步。本次没有接入在线支付，不自动发消息、不修改官方客户端配置或模型链路。

## 验收

App233项测试无跳过，typecheck/build通过。真实React renderer模拟IPC覆盖明暗主题720×700、720×520/125%、二维码加载、返回账户和界面边界；二维码原始字节复制入public，由Vite进入dist-renderer并打包。没有运行完整Electron/安装新程序/真实微信扫码充值。

用户最初要求App暂不上传，随后明确“app也上传了”，本版本按最新授权发布。标准打包遇到GitHub Electron下载超时，改用已安装的相同44.4.5版本node_modules/electron/dist，使用electron-builder --config.electronDist=node_modules/electron/dist，未更改实际运行时版本。

已发布至平台，公开 latest/minimum 均为0.3.19。release id 44698471-c9c2-44e9-a2c9-00c2aa866846，完整安装包343367815字节，SHA256 5445227811fc287fd720fccca7ac099106eff1b70c5fc7ac5780e02d9f3fa977。47个编译文件与app.asar逐字节一致，外置图标一致，EXE版本元信息0.3.19，原二维码SHA256一致。

上传使用18安装包blockmap重建19完整包，仅传输3,028,418字节，旧包hash、新完整包hash与大小均核对后，沿用管理员上传/发布接口发布完整EXE（不是给用户发布差量包）。服务器Node执行未改写的最新UpdateManager，从公开HTTPS完整下载并SHA校验达到READY；未安装或启动到开发宿主。

证据：docs/evidence/0.3.19-release.json。

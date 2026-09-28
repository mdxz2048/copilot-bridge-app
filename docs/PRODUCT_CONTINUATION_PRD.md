# Copilot Bridge — 完整产品继续开发指令

## 0. 工作规则
继续开发前，必须先完整阅读：

```
docs/MASTER_PRD.md
docs/UI_UX_PRD.md
docs/DEVELOPMENT_STATUS.md
docs/ROADMAP.md
docs/BLOCKERS.md
docs/DECISIONS.md
docs/CHANGELOG_DEV.md
docs/acceptance/phase-0.md
```
先确认：

```
最终产品目标
当前真实能力
当前已经验证的功能
未实现功能
当前 Blocker
当前下一阶段
```
然后再编码。

不要因为这次增加新功能而推翻已经通过真实 E2E 的：

```
Responses provider
Tool Bridge
function_call/function_call_output
same Copilot session continuation
Desktop Agent read/edit/shell/npm test
Original / Bridge session isolation
Original / Bridge workspace isolation
BridgeManager
```
除非新的真实 E2E 明确证明这些部分存在 Bug，否则不要重写。

每次工作必须：

```
调查
→ 实现
→ Build
→ Test
→ Package
→ 真实运行
→ E2E
→ 修复
→ 再测试
→ 更新文档
```
不要停在“代码已经写完”。

---

# 1. 产品最终定位
Copilot Bridge 不再只定义为：

```
ChatGPT Profile 切换器
```
正式产品定位升级为：

> 一个帮助普通 Windows 用户自动准备 ChatGPT、接入 GitHub Copilot、保持 Bridge 服务常驻，并安全管理 Original / Copilot 两套环境的桌面应用。
用户最终应该能够：

```
安装 Copilot Bridge
↓
没有 ChatGPT → Copilot Bridge 帮助安装
↓
连接 GitHub Copilot
↓
选择模型
↓
切换到 Copilot 环境
↓
打开 ChatGPT 直接使用
↓
Bridge 在后台自动保持可用
↓
需要时恢复原 ChatGPT 环境
```
未来进一步支持：

```
GitHub Copilot 只在个人 Gateway 登录一次
↓
多台自己的电脑通过设备授权连接
↓
每台设备无需重复登录 GitHub Copilot
```

---

# 2. 首发产品的核心功能
首发必须最终包含：

```
GitHub Copilot 登录
真实账号状态
真实 listModels()
模型选择
Reasoning 选择

Bridge 自动启动
Bridge health
Bridge restart

ChatGPT Desktop 检测
ChatGPT Desktop 一键安装

Original Profile
Bridge Profile
Original → Bridge
Bridge → Original

Session 隔离
Workspace 隔离

开机自动启动
后台常驻
系统托盘

中文 UI
无主页面滚动
错误恢复
诊断信息

NSIS 安装器
安装版完整 E2E
```
Remote Gateway 属于下一大阶段，但现在就必须把产品和接口预留好。

---

# 3. 新增 P0：ChatGPT Desktop 一键安装
这是正式首发需求。

## 3.1 启动时检测 ChatGPT
App 启动时必须检测：

```
ChatGPT Desktop 是否已安装
安装包 identity
当前版本
可否正常启动
```
不要永久硬编码某个历史 package path。

必须通过 Windows 当前真实：

```
AppX / Package registration
Microsoft Store identity
可启动 App identity
```
进行检测。

---

# 4. 未安装 ChatGPT 时的主页
ChatGPT 卡片显示：

```
ChatGPT

○ 尚未安装

安装 ChatGPT 后即可使用 Copilot Bridge。

[ 安装 ChatGPT ]
```
此时：

```
切换环境按钮隐藏
Original / Bridge 状态不伪造
```

---

# 5. ChatGPT 安装来源
只能使用官方来源。

优先：

```
Windows Package Manager / Microsoft Store
```
如果系统当前可以使用官方 Store 源：

直接发起安装。

如果自动安装失败：

```
打开官方 Microsoft Store 产品页面
```
并继续监测安装状态。

禁止：

```
从第三方网站下载 ChatGPT
自己托管未知 ChatGPT 安装包
静默下载来源不明的 MSIX/EXE
```

---

# 6. 安装流程 UI
点击：

```
安装 ChatGPT
```
出现 Modal：

```
安装 ChatGPT

正在准备官方安装…

● 检查系统环境
◌ 安装 ChatGPT
○ 验证安装
○ 准备 Copilot 环境

请稍候…
```
状态：

```
绿色 ✓ = 完成
Spinner = 当前步骤
灰色 ○ = 尚未执行
```
不要显示：

```
winget 命令
Package ID
PowerShell
AppX
```
这些只能进入 Diagnostics。

---

# 7. 安装完成后自动继续
安装完成后不要让用户：

```
关闭软件
重新打开
再次点击检查
```
App 自动：

```
重新检测 ChatGPT
↓
确认可启动
↓
检查 Original Profile
↓
检查/创建 Bridge Profile
↓
进入下一流程
```

---

# 8. 新用户：Original Profile 可以不存在
正式增加 Original Profile 状态：

```
UNINITIALIZED
READY
CUSTOM
```
定义：

### UNINITIALIZED
当前用户：

```
没有可用 Original Codex Home
从未初始化过正常 ChatGPT/Codex 环境
```
这不是错误。

### READY
用户存在正常：

```
%USERPROFILE%\.codex
```

### CUSTOM
用户安装 Copilot Bridge 前已经使用自定义：

```
CODEX_HOME
```
必须记录并恢复这个真实 prior value。

不能把 Original 一律理解为：

```
CODEX_HOME = unset
```

---

# 9. 新用户 Bridge Bootstrap
对于：

```
ChatGPT 刚安装
+
Original = UNINITIALIZED
```
Copilot Bridge 必须能够自行初始化：

```
Bridge Home
```
推荐：

```
%USERPROFILE%\.copilot-bridge\
profiles\
bridge\
codex-home\
```

---

# 10. Bridge Home 最小配置
Agent 必须研究当前 Desktop bundled Codex 版本真正需要的最小配置。

不要复制当前开发机器整个 `.codex`。

只创建：

```
当前版本实际必需的 config
Bridge provider
model
sandbox/approval
必要目录
```
其他：

```
SQLite
history
sessions
cache
```
应优先让 ChatGPT/Codex 自己生成。

---

# 11. Zero-Login Bootstrap
这是新的硬 PoC。

目标：

> 没有 OpenAI / ChatGPT 登录状态的新用户，也能先通过 Bridge 使用 GitHub Copilot。
但现在不能假定已经成立。

必须真实验证。

建立独立干净测试环境：

```
无 Original .codex
无 auth.json
无已有 Codex session
未登录 OpenAI
```
然后：

```
安装 ChatGPT
↓
创建 Bridge Home
↓
创建最小 config
↓
provider requires_openai_auth = false
↓
激活 Bridge Home
↓
启动 ChatGPT
↓
不进行 OpenAI 登录
↓
直接调用 Copilot Bridge
```
验证：

```
普通聊天
Streaming
模型
文件读取
文件修改
shell
npm test
final response
```
只有全部真实通过：

才能记录：

```
ZERO-LOGIN CHATGPT BOOTSTRAP: PASS
```
如果 Desktop 本身仍强制要求登录：

记录真实阻塞点并继续研究兼容方案。

不要伪造 PASS。

---

# 12. Original 未初始化时的 UX
如果当前：

```
Original = UNINITIALIZED
Bridge = ACTIVE
```
不要显示：

```
恢复原账号
```
改成：

```
ChatGPT

● Copilot 环境

你当前直接通过 GitHub Copilot 使用 ChatGPT。

[ 使用原版 ChatGPT ]
```
点击：

```
使用原版 ChatGPT
```
执行：

```
停用 Bridge Profile
↓
恢复/清除到系统默认 Original 状态
↓
启动官方 ChatGPT
↓
让官方 ChatGPT 自己执行首次登录/初始化
```
完成后：

```
Original = READY
```
以后按钮才使用：

```
恢复原账号
```

---

# 13. 新增 P0：开机自动启动
正式加入首发范围。

因为当前 ChatGPT Bridge Profile 指向本地：

```
127.0.0.1
```
所以 Bridge App 不运行时：

```
ChatGPT Copilot 环境不可用
```
因此开机常驻必须成为产品默认行为。

---

# 14. 默认设置
新增设置：

```
开机自动启动                    开
启动后最小化到托盘              开
自动启动 Copilot Bridge 服务     开
```
全部默认：

```
ON
```

---

# 15. 开机启动 UX
Windows 用户登录后：

```
Copilot Bridge 自动启动
↓
不弹主窗口
↓
启动 BridgeManager
↓
验证 Copilot auth
↓
启动 proxy
↓
health PASS
↓
进入托盘
```
除非：

```
首次安装
需要 GitHub 登录
ChatGPT 未安装
Profile 有错误
Bridge 启动失败
```
否则不能主动抢焦点。

---

# 16. Tray
正式实现 Windows 系统托盘。

菜单至少：

```
Copilot Bridge

● Bridge 正常

打开 Copilot Bridge

重新启动 Bridge

当前环境：
Copilot / 原账号

恢复原账号
或
切换到 Copilot

退出
```

---

# 17. Tray 状态
至少支持：

```
正常
启动中
需要登录
ChatGPT 未安装
Bridge 异常
```
可以通过 tooltip 表达：

```
Copilot Bridge — 正常
```

---

# 18. 关闭窗口逻辑
默认：

```
点击窗口 X
→ 隐藏到托盘
```
不是：

```
退出应用
```
第一次关闭时可显示一次 Toast：

```
Copilot Bridge 将继续在后台运行
```
之后不重复打扰。

---

# 19. 真正退出
从 Tray 点击：

```
退出
```
如果当前：

```
Original 环境
```
可直接退出。

如果当前：

```
Copilot 环境
```
弹窗：

```
ChatGPT 当前正在使用 Copilot Bridge。

退出后 Copilot 环境将暂时无法响应。

[取消]

[保持 Copilot 环境并退出]

[恢复原账号并退出]
```
推荐主按钮：

```
恢复原账号并退出
```

---

# 20. 关闭开机启动的警告
如果：

```
当前环境 = Bridge
```
用户关闭：

```
开机自动启动
```
显示轻量确认：

```
关闭开机启动后，Windows 重新启动时
Copilot Bridge 不会自动运行。

如果 ChatGPT 仍处于 Copilot 环境，
可能无法连接模型。

[取消] [仍然关闭]
```

---

# 21. BridgeManager
继续使用现有：

```
bridge-manager.ts
```
扩展：

```
start()
stop()
restart()
health()
status()
autoStartIfNeeded()
```
不要重新实现：

```
Responses provider
Tool Bridge
Copilot service
```

---

# 22. Bridge 启动时机
以下情况自动启动：

```
App 正常启动
且：
用户设置 autoBridgeStart = true
```
特别是：

```
当前 Profile = Bridge
```
必须优先确保 health PASS。

---

# 23. Bridge 启动失败
主页不要显示技术错误。

显示：

```
● Copilot Bridge 需要处理

Bridge 未能正常启动。

[ 修复 ]
```
点击：

```
修复
```
App 自动：

```
检查 auth
检查 runtime
检查端口
restart
health
```
失败后才显示：

```
查看诊断信息
```

---

# 24. 端口冲突
当前 8787 是固定端口。

第一版可以继续默认：

```
8787
```
但必须增加检测。

如果被其他进程占用：

不能直接崩。

优先：

```
识别是否是当前 Copilot Bridge 自己
```
否则：

```
尝试备用端口
```
并同步更新 Bridge Profile 的 provider URL。

普通用户 UI 不显示端口。

Diagnostics 可以显示。

---

# 25. UI 窗口重新优化
保留当前：

```
中文
单列
两张主卡
简洁 Apple-like 视觉语言
```
但重新调整整体比例。

当前问题：

```
底部空白过大
状态栏离内容太远
窗口视觉重心偏上
像网页而不像桌面小工具
```

---

# 26. 新的默认窗口策略
不要盲目追求更大的窗口。

初始建议：

```
width: 860px
height: 620px

minWidth: 820px
minHeight: 580px
```
但最终尺寸必须通过真实截图自动微调。

允许 Agent 在：

```
宽 840~900
高 590~650
```
范围内调整。

最终标准不是某个死数值。

最终标准：

> 主页面全部核心信息完整显示，同时没有明显大块无意义空白。

---

# 27. 内容布局
不要：

```
display:flex
status-bar margin-top:auto
```
把状态栏硬推到窗口最底部。

改成自然内容流：

```
Title Bar

24px

GitHub Copilot Section

20px

ChatGPT Section

18px

Status Bar

底部 20~24px
```
页面内容应该形成一个紧凑整体。

---

# 28. GitHub Card
目标高度：

```
Connected:
约 170~180px

Disconnected:
约 140~155px
```
内容根据状态自然变化。

---

# 29. ChatGPT Card
目标高度：

```
约 150~165px
```
不要再做很高的大卡。

---

# 30. Status Bar
Status Bar：

```
● Copilot Bridge 已就绪            查看详情
```
紧跟 ChatGPT Card。

不要贴窗口最底部。

---

# 31. 主页面继续禁止滚动
必须：

```
100%
125%
150% DPI
```
都检查：

```
vertical overflow = 0
horizontal overflow = 0
```
所有主要按钮：

```
连接 GitHub
切换到 Copilot
恢复原账号
安装 ChatGPT
```
无需滚动即可看到。

---

# 32. ChatGPT 安装状态加入主页面
ChatGPT Card 的完整状态机：

```
NOT_INSTALLED
INSTALLING
ORIGINAL_UNINITIALIZED
ORIGINAL_ACTIVE
BRIDGE_ACTIVE
SWITCHING
RESTART_REQUIRED
ERROR
```
不要使用大量互相冲突的 Boolean。

---

# 33. 状态 UI

### NOT_INSTALLED

```
ChatGPT

○ 尚未安装

安装 ChatGPT 后即可使用 Copilot Bridge。

[ 安装 ChatGPT ]
```

### INSTALLING

```
ChatGPT

◌ 正在安装…

安装完成后会自动继续。
```

### ORIGINAL_ACTIVE

```
ChatGPT

● 原账号环境

原来的账号、会话和工作目录保持不变。

[ 切换到 GitHub Copilot ]
```

### BRIDGE_ACTIVE

```
ChatGPT

● Copilot 环境

独立会话 · 独立工作区

[ 恢复原账号 ]
```

### ORIGINAL_UNINITIALIZED + Bridge Active

```
ChatGPT

● Copilot 环境

无需先登录原版 ChatGPT 即可使用。

[ 使用原版 ChatGPT ]
```

---

# 34. Settings 新增
Settings Sheet：

```
常规

主题
跟随系统

开机自动启动             ON

启动后最小化到托盘       ON

自动启动 Bridge          ON

Copilot

默认模型
...

推理强度
...

Bridge

● 正常

重新启动 Bridge

高级

打开日志目录

复制诊断信息
```

---

# 35. Remote Gateway 是下一阶段正式产品方向
不要现在开发完整公网服务。

但从现在开始：

```
BridgeManager
ModelStore
ProfileStore
UI State
```
都不得假定：

```
Copilot backend 永远在本机
```

---

# 36. Backend Mode
正式抽象：

```
BackendMode

LOCAL
REMOTE
```
当前：

```
LOCAL
```
以后：

```
REMOTE
```

---

# 37. Local Backend
当前：

```
ChatGPT Desktop
→ localhost Bridge
→ local Copilot SDK/runtime
→ GitHub Copilot
```

---

# 38. Remote Backend
未来：

```
ChatGPT Desktop
→ localhost Client Bridge
→ HTTPS
→ Personal Copilot Gateway
→ Copilot SDK/runtime
→ GitHub Copilot
```
ChatGPT Desktop 仍然只访问：

```
127.0.0.1
```
不要让 Desktop config 直接保存远程 Gateway credential。

---

# 39. 为什么保留本地 Client Bridge
Remote 模式也保留本地 helper：

```
设备认证
Token refresh
Gateway URL
health
reconnect
stream forwarding
tool round trip
```
这样：

```
ChatGPT Profile 配置不变
```
只切：

```
Bridge backend
```

---

# 40. Remote Gateway 产品目标
V1 Remote 必须严格定义：

> 一个 Copilot Owner + 多台 Owner 自己的设备。
不是：

```
一个 Copilot 账号给多个不同用户共享
```
在许可边界确认以前：

禁止实现：

```
公开共享
商业账号池
多人共享个人 Copilot subscription
```

---

# 41. Remote Gateway 认证分层
必须两套身份。

### Gateway → GitHub

```
服务器端官方 GitHub Copilot 登录
```
GitHub credential：

```
只存在服务器
```

### Device → Gateway

```
Copilot Bridge Device Credential
```
客户端永远拿不到服务器 GitHub credential。

---

# 42. Remote 第一次登录体验
Gateway：

```
尚未连接 GitHub Copilot

[连接 GitHub Copilot]
```
用户：

```
GitHub 登录一次
```
之后服务器保存官方 runtime/session credential。

---

# 43. 新设备体验
Windows 新设备：

```
连接到我的 Copilot Gateway
```
设备生成：

```
Device ID
Device Name
Device Public Key / pairing secret
```
服务器出现：

```
新设备请求

DESKTOP-XXXX
Windows

[拒绝] [允许]
```
允许后：

签发独立：

```
Device Credential
```
以后该设备不再进行 GitHub 登录。

---

# 44. Device Management
Remote V1 必须支持：

```
设备列表
设备名称
最后连接时间
状态
撤销设备
```
撤销设备：

```
Device A 立即失效
Device B 不受影响
GitHub Credential 不受影响
```

---

# 45. Remote Session Isolation
Session Key 至少：

```
owner_id
device_id
client_thread_id
```
禁止：

```
所有设备共享一个 SDK Session
```

---

# 46. Remote Tool 执行边界
必须继续保持：

```
Remote Gateway
=
模型推理
SDK session
tool decision

Local ChatGPT/Codex
=
filesystem
patch
shell
npm test
```
Remote Server 默认：

```
不执行客户端电脑命令
```

---

# 47. Remote Gateway 安全
公网之前必须有：

```
HTTPS/TLS
Device Auth
Credential Vault
Rate Limit
Session Isolation
Revocation
Secret Redaction
Audit Metadata
Cancellation
Timeout
```
禁止：

```
公网 plain HTTP
公网未认证 /health diagnostics
把 GitHub OAuth credential 发客户端
使用一个永久公开 API Key 给所有设备
```

---

# 48. Server Credential Vault
抽象：

```
CredentialVault
```
接口：

```
status()
store()
load()
rotate()
revoke()
```
不要让服务器代码直接到处读写 token 文件。

---

# 49. Remote PoC 不要直接上公网
正式服务器开发前：

先在一台机器模拟：

```
Gateway Server
127.0.0.1:9000

Client Bridge
127.0.0.1:8787
```
然后：

```
ChatGPT
→ Client Bridge
→ Gateway
→ Copilot
```

---

# 50. Remote PoC A
验证：

```
Text
Streaming
Models
Reasoning
function_call
function_call_output
same-session continuation
read
edit
shell
npm test
response.completed
```

---

# 51. Remote PoC B
模拟：

```
Gateway GitHub 登录一次

Client A
Client B
```
两个 client：

```
均无 GitHub credential
```
但都能通过 Gateway 使用。

---

# 52. Remote PoC C
验证设备隔离：

```
A Thread 1
B Thread 1
```
不能串 Session。

然后：

```
撤销 Device A
```
结果：

```
A → unauthorized
B → 正常
GitHub server auth → 正常
```

---

# 53. 当前实现顺序
现在不要直接开发完整 Remote Server。

严格顺序：

```
Phase A
ChatGPT Detection + Official Install

Phase B
Fresh Install / Zero-Login Bootstrap

Phase C
Startup + Tray + Bridge Auto Start

Phase D
Current UI Layout Refinement

Phase E
App-driven Complete Local E2E

Phase F
Remote Gateway Localhost PoC

Phase G
Device Pairing / Auth

Phase H
Remote Two-device E2E

Phase I
TLS / Deployment / Gateway Productization
```

---

# 54. Phase A 验收
真实环境：

```
ChatGPT 未安装
↓
App 检测
↓
安装 ChatGPT
↓
安装成功
↓
App 自动发现
```
PASS。

---

# 55. Phase B 验收
干净状态：

```
ChatGPT 新安装
无 Original Codex Home
无 OpenAI auth
```
App：

```
创建 Bridge Home
↓
配置 Bridge
↓
启动 ChatGPT
```
最终：

```
Copilot Chat PASS
Agent Tool PASS
```
才可：

```
ZERO-LOGIN BOOTSTRAP: PASS
```

---

# 56. Phase C 验收
安装版：

```
开机启动 = ON
最小化托盘 = ON
Bridge Auto Start = ON
```
重启 Windows：

```
App 后台启动
主窗口不抢焦点
Tray 存在
Bridge health PASS
ChatGPT 使用正常
```

---

# 57. Phase D 验收
真实 installed build：

```
默认中文

布局自然

无大块无意义空白

状态栏紧跟内容

100/125/150% 无滚动

核心按钮全部可见
```
Agent 必须真实截图并自己检查。

---

# 58. Phase E 本地完整 E2E
完整模拟普通用户：

```
安装 Copilot Bridge
↓
安装/发现 ChatGPT
↓
连接 Copilot
↓
模型选择
↓
Bridge start
↓
切到 Copilot
↓
ChatGPT
↓
问答
↓
读文件
↓
改文件
↓
npm test
↓
恢复 Original
↓
Original sessions 保留
↓
再切 Bridge
↓
Bridge sessions 保留
```
全部真实 PASS。

---

# 59. 当前文档必须同步
现在立即更新：

```
docs/MASTER_PRD.md
docs/UI_UX_PRD.md
docs/ROADMAP.md
docs/DEVELOPMENT_STATUS.md
docs/BLOCKERS.md
docs/DECISIONS.md
docs/CHANGELOG_DEV.md
```
新增正式 ADR：

```
ADR — Copilot Bridge owns ChatGPT bootstrap experience

ADR — Bridge defaults to Windows startup + tray resident

ADR — Original Profile may be UNINITIALIZED

ADR — Backend abstraction supports Local / Remote

ADR — Remote V1 is one owner / multiple owner devices

ADR — Remote tools remain client-executed
```

---

# 60. 文档状态规则
MASTER_PRD：

```
最终产品是什么
```
UI_UX_PRD：

```
用户看到什么、如何操作
```
DEVELOPMENT_STATUS：

```
当前真正做到哪
```
ROADMAP：

```
下一阶段
```
BLOCKERS：

```
还卡什么
```
DECISIONS：

```
为什么这么设计
```
禁止把：

```
计划
```
写成：

```
已经完成
```

---

# 61. 当前立即执行任务
现在开始，不要先问用户。

执行：

```
1. 更新所有正式产品文档

2. 实现 ChatGPT Desktop Detector

3. 验证当前 Windows 上真实 Store identity / install mechanism

4. 实现官方来源 ChatGPT 安装流程

5. 建立 Original UNINITIALIZED 状态

6. 建立干净 Bridge Home Bootstrap

7. 建立 Zero-Login PoC

8. Zero-Login 成功后，
   实现开机自动启动

9. 实现托盘

10. 实现 Bridge 自动启动

11. 优化当前窗口比例/内容流

12. Package installed build

13. 运行完整本地 E2E
```

---

# 62. 如果需要用户参与
只有以下情况可以停下来要求用户：

```
GitHub Device OAuth 浏览器授权

Windows 需要用户确认的 Store 安装

Windows 重启 / 登录

系统 UAC

真实外部 Gateway 域名/TLS
```
其他问题：

Agent 自己调查、修复和继续。

---

# 63. 禁止事项
禁止：

```
重新实现 Responses API

重新实现 Tool Bridge

删除 Original .codex

执行 codex logout

复制 Original GitHub/OpenAI secret

下载非官方 ChatGPT 安装包

为了 Remote 模式让服务器执行客户端 shell/filesystem

直接把本地 8787 裸露公网

把 server GitHub credential 发送客户端

把 Remote 尚未实现写成已完成
```

---

# 64. 本轮最终汇报格式
完成本阶段后必须汇报：

```
CURRENT PHASE:

ChatGPT Detection:
PASS / FAIL

ChatGPT Official Install:
PASS / FAIL

Original UNINITIALIZED:
PASS / FAIL

Bridge Fresh Bootstrap:
PASS / FAIL

Zero-Login ChatGPT:
PASS / FAIL

Startup:
PASS / FAIL

Tray:
PASS / FAIL

Bridge Auto Start:
PASS / FAIL

UI Layout:
PASS / FAIL

100 / 125 / 150 DPI:
PASS / FAIL

Local Full E2E:
PASS / FAIL

Remaining Blockers:
...

Next Phase:
...
```
只有真实验证通过才能写 PASS。

---

# 65. 最终产品体验再次确认
普通新用户最终应该做到：

```
安装 Copilot Bridge

↓

打开

↓

没有 ChatGPT？
点击安装

↓

连接 GitHub Copilot

↓

选择模型

↓

直接使用 Copilot 环境

↓

以后 Windows 开机
Copilot Bridge 自动后台运行

↓

用户正常打开 ChatGPT
直接使用
```
未来个人多设备：

```
Gateway GitHub 登录一次

↓

电脑 A 配对
电脑 B 配对
电脑 C 配对

↓

所有自己的设备
无需重复进行 GitHub Copilot 登录
```
这就是产品最终方向。

现在按上述顺序继续开发。
# Copilot Bridge UI / UX V2

## Authority

This document is the only Desktop UI/UX source of truth. The V2 rules in this
section override older examples below when they conflict.

## Product language

Normal user-facing UI exposes exactly two AI services:

```text
Copilot Bridge 云服务 = REMOTE
我的 GitHub Copilot = LOCAL
```

The normal UI must not expose `LOCAL`, `REMOTE`, `backendMode`, Provider,
Gateway, `CODEX_HOME`, Responses API, Runtime, or Tool Bridge. Those terms are
restricted to diagnostics.

Local Agent capabilities such as read, edit, create, shell, and test are
available in both services. They are not subscription-locked features.

## Window and density

```text
Default: 760 x 560
Minimum: 720 x 520
Page horizontal padding: 24px
Section gap: 16px or less when needed at minimum height
Card padding: 20-24px
Card radius: 16-18px
Button height: 38-42px
Input/select height: about 40px
Main-page scrolling: forbidden
```

Main card headings are 20-22px. Body text is 14-15px and secondary text is
12-13px. The app remains light-first, Apple-inspired, restrained, and uses the
existing token palette.

## Home information architecture

The home page contains:

1. title bar;
2. `在 ChatGPT 中使用 Copilot Bridge` environment switch;
3. a compact account/subscription status line;
4. `当前 AI 服务` card;
5. low-emphasis status/version/diagnostics row.

The compact account line shows plan, Server-provided used points when
available, expiry, and an Account affordance. Email, device, history, referral,
and detailed usage live only in Account detail.

The AI service card shows the active service, connection state, model selector,
capability-aware reasoning selector, service switch, and ChatGPT action. Cloud
models come only from the Server catalog; Local models come only from the
Copilot SDK catalog.

## Service switching

`切换 AI 服务` opens a dedicated service selector, not Settings. Switching is
transactional:

```text
validate target authentication
stop current Bridge
start target mode
load target model catalog
choose a legal model
validate health
persist mode/model
```

On failure, restart the previous service and retain the previous persisted
mode/model. A half-switched UI/backend state is forbidden.

## Account and subscription

The account detail Sheet is 380-420px wide and uses sections and dividers
rather than nested cards. It displays Server-authoritative account, plan,
subscription, period, usage, device, and Cloud status. Device IDs may appear
only here in shortened form with a copy action.

Renewal, upgrade, and subscription management open the external Web
subscription page. Desktop never determines payment success or locally grants
plan/model access.

The following states have explicit titles, descriptions, and actions:

```text
SIGNED_OUT
AUTHENTICATING
AUTHENTICATED
DEVICE_REVOKED
SUBSCRIPTION_REQUIRED
SUBSCRIPTION_EXPIRED
QUOTA_EXCEEDED
SERVER_UNREACHABLE
```

Cloud failure never disables the Local service.

The ChatGPT environment switch and AI provider are independent. Switch off
means Original ChatGPT configuration. Switch on means Bridge Home and the
selected provider. The persistent environment backend requires Windows
sign-out/in or restart before ChatGPT inherits a changed switch target.

## Settings

Settings contains software settings only:

- ChatGPT environment and management;
- startup and tray behavior;
- appearance;
- diagnostics and Bridge restart;
- about/version.

AI service, account/subscription, model, and reasoning selection do not belong
in Settings because they are available directly from the home page.

## Refresh behavior

Account state refreshes on app start, successful login, foreground focus,
Cloud selection, account detail open, entitlement errors, browser return, and
manual refresh. Refreshes are deduplicated; continuous polling is forbidden.

## Acceptance

Required real visual states:

- first run;
- authenticated Cloud;
- connected Local;
- Cloud signed out;
- subscription expired;
- quota exhausted;
- device revoked;
- server offline;
- Local disconnected;
- service selector;
- account detail;
- settings.

Required viewport/DPI checks:

```text
760 x 560
720 x 520
100%
125%
150%
```

The main page must have no horizontal overflow, vertical scroll, clipped text,
or overlapping buttons. Settings and detail Sheets may scroll.

---

## Legacy detailed specification

The sections below remain implementation guidance except where superseded by
the V2 rules above.

对，UI 这部分不能只写成“Apple-like、简洁、圆角”，这种要求对 Agent 太模糊，最后很容易做成“浅灰背景 + 几个白卡片”，但整体还是像网页。

我建议直接把 **视觉效果、尺寸、颜色、字体、间距、按钮、下拉框、弹窗、Loading、错误状态、Dark Mode、动画、标题栏**全部写死到 `docs/UI_UX_PRD.md`。Agent 后面只需要照着实现，不再自己发挥设计。

下面这份可以直接作为正式 UI 产品文档。

---

# `docs/UI_UX_PRD.md`

## Copilot Bridge UI / UX Product Specification

### 1. 设计目标

Copilot Bridge 应当像一个精致、轻量、原生感强的 Windows 系统工具，而不是网页后台、开发者控制台或 Electron Demo。

视觉参考方向：

**macOS System Settings / AirPods 设置 / Arc 小型设置面板 / Raycast Preferences 的克制感**

但不能直接复制 Apple 私有设计资源。

用户打开软件后，应该在 3 秒内理解：

```text
GitHub Copilot 是否已连接

当前使用哪个模型

ChatGPT 当前是“原账号”还是“Copilot”
```

主界面禁止出现：

```text
Responses API
CODEX_HOME
model_provider
localhost
API Key
function_call
SQLite
Tool Bridge
Profile Manager
```

这些只能存在于诊断详情。

---

# 2. 总体视觉效果

最终效果应接近：

```text
┌────────────────────────────────────────────────────┐
│  ◉  Copilot Bridge                           ⚙ ─ □ ×│
│                                                    │
│                                                    │
│  GitHub Copilot                                    │
│  ╭──────────────────────────────────────────────╮  │
│  │                                              │  │
│  │  ● 已连接                                   │  │
│  │                                              │  │
│  │  模型                                        │  │
│  │  GPT-5.6 Terra                          ▾    │  │
│  │                                              │  │
│  │  推理强度                                    │  │
│  │  高                                     ▾    │  │
│  │                                              │  │
│  ╰──────────────────────────────────────────────╯  │
│                                                    │
│  ChatGPT                                           │
│  ╭──────────────────────────────────────────────╮  │
│  │                                              │  │
│  │  ● 原账号环境                                │  │
│  │                                              │  │
│  │  原来的账号、会话和工作目录保持不变          │  │
│  │                                              │  │
│  │        ┌──────────────────────────┐          │  │
│  │        │  切换到 GitHub Copilot  │          │  │
│  │        └──────────────────────────┘          │  │
│  │                                              │  │
│  ╰──────────────────────────────────────────────╯  │
│                                                    │
│  ● Copilot Bridge 已就绪                 查看详情  │
│                                                    │
└────────────────────────────────────────────────────┘
```

不要增加第三张大卡片。

不要 Sidebar。

不要顶部导航 Tab。

---

# 3. Window

默认尺寸：

| 属性     |      要求 |
| ------ | ------: |
| 默认宽度   | `820px` |
| 默认高度   | `590px` |
| 最小宽度   | `760px` |
| 最小高度   | `540px` |
| 启动位置   |    屏幕居中 |
| 默认最大化  |       否 |
| 主页面滚动  |      禁止 |
| Resize |      支持 |

窗口启动时不要出现一大片空白。

Renderer 尚未 ready 时：

```text
Copilot Bridge

正在准备…
```

使用轻量 Loading。

---

# 4. Windows 标题栏

当前截图中的：

```text
File
Edit
View
Window
```

全部删除。

必须：

```ts
Menu.setApplicationMenu(null)
```

标题栏采用 Windows 原生窗口行为 + 自定义视觉层。

不要第一版直接 `frame:false` 自己重写整个窗口系统。

优先：

```text
titleBarStyle
titleBarOverlay
```

保留：

```text
最小化
最大化
关闭
Windows Snap Layout
```

效果：

```text
◉  Copilot Bridge                         ⚙   ─ □ ×
```

左侧：

```text
24×24 App Icon
Copilot Bridge
```

右侧：

```text
Settings
Windows Window Controls
```

Title Bar 高度：

```text
48px
```

---

# 5. 字体

Windows：

```text
"Segoe UI Variable",
"Segoe UI",
sans-serif
```

禁止打包：

```text
SF Pro
SF Symbols
Apple 私有字体
```

字体规范：

| 用途         |   Size | Weight |
| ---------- | -----: | -----: |
| App 标题     |   15px |    600 |
| Section 标题 |   14px |    600 |
| Card 主状态   |   16px |    600 |
| 普通文本       |   14px |    400 |
| 二级说明       |   13px |    400 |
| Button     |   14px |    600 |
| 状态栏        | 12.5px |    400 |

不要大量粗体。

---

# 6. Light Theme

统一 Design Tokens：

```css
--bg-window: #F5F5F7;

--surface-primary: #FFFFFF;
--surface-secondary: #F9F9FB;
--surface-hover: #F4F4F6;

--text-primary: #1D1D1F;
--text-secondary: #6E6E73;
--text-tertiary: #98989D;

--border-subtle: rgba(0, 0, 0, 0.065);
--border-control: rgba(0, 0, 0, 0.10);

--accent: #007AFF;
--accent-hover: #0071E3;
--accent-pressed: #0068D1;

--success: #34C759;
--warning: #FF9F0A;
--danger: #FF3B30;

--focus-ring: rgba(0, 122, 255, 0.28);
```

不要纯：

```text
#000000
#FFFFFF 大面积强对比
```

---

# 7. Dark Theme

```css
--bg-window: #1C1C1E;

--surface-primary: #2C2C2E;
--surface-secondary: #242426;
--surface-hover: #343437;

--text-primary: #F5F5F7;
--text-secondary: #AEAEB2;
--text-tertiary: #8E8E93;

--border-subtle: rgba(255, 255, 255, 0.07);
--border-control: rgba(255, 255, 255, 0.11);
```

Accent 和状态色可沿用系统色，但 Dark 下控制亮度。

Theme 选项：

```text
跟随系统
浅色
深色
```

默认：

```text
跟随系统
```

---

# 8. 页面布局

主内容最大宽度：

```text
704px
```

居中。

Window 左右 Padding：

```text
44px
```

顶部内容区 Padding：

```text
26px
```

Section 之间：

```text
26px
```

Section Title 到 Card：

```text
10px
```

Card 内部：

```text
24px
```

不要所有元素挤在一起。

---

# 9. Card

Card：

```text
background: surface-primary
border: 1px solid border-subtle
border-radius: 18px
```

Light Shadow：

```css
box-shadow:
0 1px 2px rgba(0,0,0,.03),
0 6px 24px rgba(0,0,0,.025);
```

禁止夸张阴影。

Card 默认不做 Hover 漂浮。

这是信息容器，不是可点击卡片。

---

# 10. GitHub Copilot Card

Connected：

```text
GitHub Copilot

● 已连接

模型
GPT-5.6 Terra                                    ▾

推理强度
高                                               ▾
```

状态圆点：

```text
6px
```

不要使用巨大绿色 Icon。

模型与 Reasoning 用统一 Select Control。

---

# 11. Select Control

高度：

```text
42px
```

Border Radius：

```text
10px
```

背景：

```text
surface-secondary
```

默认：

```text
无明显边框
```

Hover：

```text
surface-hover
```

Focus：

```text
1px accent
+
2px focus ring
```

布局：

```text
GPT-5.6 Terra                                chevron-down
```

不要使用浏览器原生 `<select>` 外观。

做自定义 Dropdown。

---

# 12. Dropdown

例如 Model Dropdown：

```text
╭────────────────────────────────╮
│ 自动                           │
│────────────────────────────────│
│ GPT-5.6 Terra             ✓    │
│ Claude ...                      │
│ Gemini ...                      │
╰────────────────────────────────╯
```

尺寸：

```text
宽度 = Trigger 宽度
最大高度 = 300px
```

Radius：

```text
12px
```

Shadow：

```text
0 12px 40px rgba(0,0,0,.12)
```

Item：

```text
height 38px
padding 0 12px
```

Hover：

```text
surface-hover
```

不要展示：

```text
model slug
token 数
API capability
provider
```

---

# 13. GitHub 未连接状态

Card：

```text
GitHub Copilot

○ 未连接

连接你的 GitHub Copilot 账号后即可使用。

[ 连接 GitHub ]
```

Button 不需要填满整张 Card。

---

# 14. Primary Button

例如：

```text
切换到 GitHub Copilot
```

高度：

```text
44px
```

最小宽度：

```text
220px
```

Radius：

```text
11px
```

背景：

```text
accent
```

文字：

```text
white
14px / 600
```

Hover：

```text
accent-hover
```

Pressed：

```text
accent-pressed
transform: scale(.985)
```

Disabled：

```text
opacity .45
```

---

# 15. Secondary Button

例如：

```text
恢复原账号
重新启动 Bridge
取消
```

样式：

```text
background: surface-secondary
color: text-primary
```

Hover：

```text
surface-hover
```

不要所有按钮都是蓝色。

---

# 16. Destructive Button

只有真正危险操作：

```text
清除 Bridge 数据
```

以后才可以用红色。

“恢复原账号”不是危险操作。

不要做红色。

---

# 17. ChatGPT Card — Original

```text
ChatGPT

● 原账号环境

原来的账号、会话和工作目录保持不变。


              [ 切换到 GitHub Copilot ]
```

状态标题：

```text
16px / 600
```

说明：

```text
13px
text-secondary
```

---

# 18. ChatGPT Card — Bridge

```text
ChatGPT

● Copilot 环境

独立会话 · 独立工作区
当前模型：GPT-5.6 Terra


                 [ 恢复原账号 ]
```

不要显示：

```text
Profile: bridge
CODEX_HOME: ...
```

---

# 19. Environment Switching

用户点击：

```text
切换到 GitHub Copilot
```

按钮立即进入：

```text
正在准备…
```

Disable 二次点击。

如果操作超过：

```text
500ms
```

出现 Progress Dialog。

---

# 20. Progress Dialog

尺寸：

```text
420 × auto
```

效果：

```text
╭────────────────────────────────────────╮
│ 正在准备 Copilot                       │
│                                        │
│ ● 检查 GitHub Copilot                  │
│ ● 启动 Copilot Bridge                  │
│ ◌ 准备 ChatGPT                         │
│                                        │
│ 请稍候…                                │
╰────────────────────────────────────────╯
```

成功步骤：

```text
绿色 check
```

当前步骤：

```text
小型 spinner
```

未开始：

```text
灰色圆点
```

不要做百分比 Progress Bar。

---

# 21. Modal 基础样式

所有 Modal：

```text
宽度 420~480px
最大 520px
```

Radius：

```text
18px
```

Padding：

```text
24px
```

Backdrop：

```css
background: rgba(0,0,0,.20);
backdrop-filter: blur(6px);
```

进入动画：

```text
opacity 0 → 1
scale .975 → 1
180ms
```

退出：

```text
140ms
```

---

# 22. GitHub Login Modal

```text
连接 GitHub Copilot

请在浏览器中完成 GitHub 登录。

设备代码

╭──────────────────────────╮
│        AB12-CD34         │
╰──────────────────────────╯

✓ 已打开 GitHub 登录页面

正在等待授权…

取消
```

设备 Code：

```text
18px
font-weight 600
letter-spacing 1.5px
```

提供：

```text
复制代码
```

图标按钮。

---

# 23. GitHub Login Success

不要再开第二个确认 Modal。

原 Modal 内：

```text
✓ GitHub Copilot 已连接
```

显示约：

```text
800ms
```

然后自动关闭。

---

# 24. Environment Setup Modal

首次切 Bridge：

```text
设置 Copilot 环境

Copilot 会使用独立的会话和工作区，
不会删除或修改你的原账号数据。

[取消]              [创建并继续]
```

第一版不要放 Import。

等 Import 真正实现以后再加入。

---

# 25. Restart Dialog

当前真实实现需要 Windows Restart 时：

```text
应用新的环境

Copilot 环境已经准备完成。

Windows 需要重新启动一次才能让
ChatGPT 使用新的环境。


[稍后]        [重新启动 Windows]
```

Restart 按钮不要红色。

如果以后只需要 Restart ChatGPT：

文案动态变成：

```text
重新启动 ChatGPT 后即可生效。
```

按钮：

```text
重新启动 ChatGPT
```

---

# 26. 不允许 “I restarted Windows”

这个交互必须删除。

App 自己启动时检测 pending transaction。

检测成功后：

显示 Toast：

```text
✓ 已切换到 Copilot 环境
```

3 秒后消失。

---

# 27. Toast

位置：

```text
Window bottom center
```

不要右上角网页通知风格。

样式：

```text
高度 38~42px
radius 20px
```

例如：

```text
✓ GitHub Copilot 已连接
```

或者：

```text
✓ 已恢复原账号
```

Error Toast：

```text
Copilot Bridge 启动失败    查看详情
```

---

# 28. Error Dialog

普通错误不要显示技术异常。

例如 Bridge health 失败：

```text
Copilot Bridge 暂时不可用

重新启动 Bridge 通常可以解决这个问题。

[取消]        [重新启动 Bridge]
```

下面提供很轻的：

```text
查看诊断信息
```

---

# 29. Diagnostics Dialog

这是技术信息唯一入口之一。

```text
诊断信息

GitHub Copilot
● 已连接

Bridge
● 正常

ChatGPT 环境
Copilot

模型
GPT-5.6 Terra

App
0.x.x


[复制诊断信息]

                [关闭]
```

展开高级信息后才显示：

```text
port
logs
provider
runtime
CODEX_HOME
```

默认折叠。

---

# 30. Settings Sheet

右侧或中央 Sheet 均可。

我倾向：

**右侧浮层 Sheet**

宽：

```text
440px
```

高度：

```text
窗口高度 - 32px
```

右边：

```text
16px margin
```

效果：

```text
┌──────────────────────────────────────────────┐
│ 主页面                ╭────────────────────╮ │
│                       │ 设置             × │ │
│                       │                    │ │
│                       │ 常规               │ │
│                       │ 主题       系统 ▼  │ │
│                       │ 开机启动      ○    │ │
│                       │ 关闭到托盘    ○    │ │
│                       │                    │ │
│                       │ Copilot            │ │
│                       │ 默认模型     ...   │ │
│                       │ 推理强度     ...   │ │
│                       │                    │ │
│                       │ Bridge             │ │
│                       │ ● 正常             │ │
│                       │ 重新启动 Bridge    │ │
│                       │                    │ │
│                       │ 高级               │ │
│                       │ 打开日志目录       │ │
│                       │ 复制诊断信息       │ │
│                       ╰────────────────────╯ │
└──────────────────────────────────────────────┘
```

---

# 31. Toggle

尺寸：

```text
40 × 22px
```

Track Radius：

```text
11px
```

ON：

```text
accent
```

OFF：

```text
#D1D1D6
```

Thumb：

```text
18px white
```

不要使用 Checkbox。

---

# 32. Settings Row

统一：

```text
height 48px
```

左：

```text
名称
```

右：

```text
control/value
```

Group 间：

```text
24px
```

不要每个设置放 Card。

整个 Settings Sheet 本身就是容器。

---

# 33. Status Bar

主页面底部：

```text
● Copilot Bridge 已就绪                        查看详情
```

高度：

```text
36px
```

无 Card。

Text：

```text
12.5px
```

---

# 34. Loading

禁止：

```text
全屏巨大 spinner
```

启动时：

```text
小 Logo

Copilot Bridge

正在检查环境…
```

如果：

```text
< 600ms
```

甚至不显示文案，只 fade in 页面。

---

# 35. Skeleton

模型列表读取时：

Select 内：

```text
正在获取模型…
```

不要用网页式 Skeleton 大块闪动。

---

# 36. Animation

统一：

```text
Fast      120ms
Normal    180ms
Slow      240ms
```

Curve：

```css
cubic-bezier(.2,.8,.2,1)
```

应用到：

```text
button
dropdown
modal
sheet
toast
```

禁止弹簧乱跳。

---

# 37. Hover

Card：

```text
无 hover
```

Button：

```text
轻微颜色变化
```

Icon：

```text
background circle / radius 8
```

Select：

```text
浅灰变化
```

不要元素一碰就向上漂。

---

# 38. App Icon

第一版可以临时继续现有 icon。

后续正式 Icon：

概念：

```text
Bridge
Connection
Two environments
```

推荐几何：

```text
两个相互连接的弧 / 圆环
```

不要直接：

```text
OpenAI Logo
GitHub Logo
Copilot Logo
```

拼起来。

---

# 39. Empty State

如果未检测到 ChatGPT：

ChatGPT Card：

```text
ChatGPT

○ 未检测到

需要安装 Windows 版 ChatGPT 才能使用环境切换。

查看说明
```

不要整个软件报错退出。

---

# 40. Bridge 不运行但 Original Active

这是正常状态。

不能显示红灯。

显示：

```text
Copilot Bridge 已就绪
```

只有用户进入 Bridge 环境且 Bridge 不可用时才红色。

---

# 41. Copilot Authentication Failure

```text
GitHub Copilot

● 需要重新连接

GitHub Copilot 登录已失效。

[重新连接]
```

不要显示：

```text
AUTH_ERROR
401
SDK auth false
```

---

# 42. Model Unavailable

用户之前选择：

```text
GPT-5.6 Terra
```

后来 SDK listModels 不再返回。

显示：

```text
之前选择的模型当前不可用，
已临时切换为自动。
```

Toast 一次。

Select 改：

```text
自动
```

---

# 43. Reasoning Mapping

UI：

```text
自动
低
中
高
极高
```

内部：

```text
auto
low
medium
high
xhigh
```

不支持某级别：

不要展示。

---

# 44. Main UI 正常情况下不超过约 520px 内容高度

这样窗口不会显得空，也不会显得挤。

现在截图的最大视觉问题之一就是：

```text
窗口巨大
+
内容为空
```

必须避免。

---

# 45. 响应式

760px Width 时：

仍然保持单列。

不要变成双列。

缩小：

```text
horizontal padding
44 → 28
```

Card width：

```text
100%
```

---

# 46. DPI

必须真实截图检查：

```text
100%
125%
150%
```

检查：

```text
titlebar
dropdown
modal
text clipping
button
window controls
```

---

# 47. Accessibility

最低要求：

```text
Keyboard Tab navigation
Enter / Space
Esc closes Modal
Visible focus ring
ARIA label
```

颜色不是唯一状态标识。

例如：

```text
● 已连接
```

不仅绿色点。

---

# 48. UI 文件结构

不要继续：

```text
App.tsx
+
一个 style.css
```

正式拆：

```text
src/
├─ app/
│  └─ App.tsx
│
├─ components/
│  ├─ AppTitleBar.tsx
│  ├─ CopilotCard.tsx
│  ├─ EnvironmentCard.tsx
│  ├─ ModelSelect.tsx
│  ├─ ReasoningSelect.tsx
│  ├─ StatusBar.tsx
│  ├─ Button.tsx
│  ├─ Select.tsx
│  └─ Toggle.tsx
│
├─ dialogs/
│  ├─ GitHubLoginDialog.tsx
│  ├─ EnvironmentSetupDialog.tsx
│  ├─ SwitchProgressDialog.tsx
│  ├─ RestartDialog.tsx
│  ├─ ErrorDialog.tsx
│  └─ DiagnosticsDialog.tsx
│
├─ settings/
│  └─ SettingsSheet.tsx
│
├─ styles/
│  ├─ tokens.css
│  ├─ reset.css
│  ├─ global.css
│  └─ animation.css
│
└─ hooks/
```

---

# 49. Agent 不得自由更改视觉语言

Agent 实现过程中：

如果需要新增控件：

必须复用：

```text
Design Tokens
Button
Select
Toggle
Modal
Sheet
```

不要每个页面自己写一种样式。

---

# 50. UI 开发第一优先级

目前真实 portable EXE：

**Renderer 是空白。**

所以：

```text
P0
先修 renderer blank
```

必须在：

```text
electron-builder portable EXE
```

真实运行验证。

Dev Server 正常：

**不算 PASS。**

---

# 51. UI 实施顺序

严格：

```text
UI-0
Fix Packaged Renderer Blank

UI-1
Remove Default Electron Menu

UI-2
Window / Title Bar

UI-3
Design Token System

UI-4
Main Static Layout

UI-5
Reusable Controls

UI-6
Copilot Authentication UX

UI-7
Real Model listModels

UI-8
Reasoning

UI-9
Environment State

UI-10
Environment Switch UX

UI-11
Bridge Manager + Health

UI-12
Settings

UI-13
Error / Diagnostics

UI-14
Dark Mode

UI-15
Tray

UI-16
Startup

UI-17
Final E2E
```

---

# 52. 每完成 UI 阶段都必须截图自检

不是只看代码。

Agent 必须：

```text
Build
↓
Package
↓
Launch portable EXE
↓
Screenshot
↓
检查截图
↓
找视觉问题
↓
修改
↓
重新截图
```

检查：

```text
对齐
间距
字体
层级
空白
按钮大小
圆角
颜色
Dark Mode
```

---

# 53. 禁止的视觉结果

如果最终看起来像：

```text
Bootstrap
Ant Design 后台
Windows Forms
Electron Demo
网页 Dashboard
```

则 UI 验收失败。

禁止：

```text
十几个边框
每块都 Card
每项都带 Icon
过多蓝色
渐变背景
Glass everywhere
巨大 Status Indicator
```

---

# 54. 最终设计目标

用户应该感觉：

> “这是一个只有一件事需要我操心的小工具。”

而不是：

> “这是一个我需要先学会 Provider、Responses、Profile 才能用的开发工具。”

---

# 55. 将本 PRD 写入项目

Agent 必须创建：

```text
docs/UI_UX_PRD.md
```

并将本完整规范写入。

然后：

```text
docs/MASTER_PRD.md
```

加入：

```text
## UI / UX

UI 设计与交互的唯一规范：

docs/UI_UX_PRD.md
```

如果其他文档中的旧 UI 描述冲突：

以：

```text
UI_UX_PRD.md
```

为准。

---

# 给 Agent 的执行指令

把下面一起交给 Agent：

> 从现在开始，UI 不允许再根据个人理解自由发挥。首先把以上完整 UI/UX 规范写入 `docs/UI_UX_PRD.md`，并在 `MASTER_PRD.md` 中将其声明为 UI 的唯一事实来源。
>
> 开发每一个 UI 阶段前必须重新读取 `UI_UX_PRD.md`。
>
> 当前第一个任务不是改颜色，而是修复 packaged portable EXE 的 renderer blank。必须在真实 portable EXE 中 PASS 后才开始视觉重构。
>
> 视觉重构时严格按照 PRD 中的窗口尺寸、颜色 Token、字体、Card、Button、Select、Modal、Sheet、Toast、Loading、Dark Mode、间距与动画规范实现。
>
> 不允许自行增加 Sidebar、Dashboard、复杂页面或技术参数。
>
> 每完成一个视觉阶段都必须运行真实 packaged EXE、截图、检查截图并继续优化，不能只通过单元测试判断 UI 完成。
>
> UI 的最终验收依据不是“代码已经写完”，而是实际截图和完整用户操作体验。

---

# 56. 补充硬规范：中文默认与主界面零滚动

本节覆盖此前与其冲突的窗口尺寸、默认语言、主页文案和主页布局
要求。

## 56.1 默认语言

第一版默认语言必须为简体中文（`zh-CN`）。建立并使用：

```text
src/locales/
├─ zh-CN.ts
└─ en-US.ts
```

文案不得散落在 JSX 中。英文仅作为未来语言选项；第一版的正常用户
界面不得显示临时英文文案、技术状态或生硬直译。

主页不显示 Hero 标题、`Choose your coding environment`、`Active after
restart`、`Original ChatGPT`、`GitHub Copilot Bridge`、`Selected` 或
`Use Original ChatGPT`。

产品化中文使用：

| 旧/技术概念 | 主页产品文案 |
| --- | --- |
| GitHub Copilot | GitHub Copilot |
| Connect GitHub Copilot | 连接 GitHub Copilot |
| Original ChatGPT | 原账号环境 |
| GitHub Copilot Bridge | Copilot 环境 |
| Selected | 当前使用 |
| Reasoning Effort | 推理强度 |
| Settings | 设置 |
| Diagnostics | 诊断信息 |

`Active after restart` 不允许直译或显示在主页；重启是按需出现的流程
对话框，而不是永久状态卡。

## 56.2 主页结构与中文文案

主页只允许以下四个视觉区域：

```text
Title Bar
GitHub Copilot Section
ChatGPT Section
Status Bar
```

主页不得增加 Sidebar、顶部 Tab、第三张大卡片、日志、诊断、导入、
权限大段说明、重启步骤或高级技术参数。

原账号环境：

```text
GitHub Copilot
● 已连接
模型：GPT-5.6 Terra
推理强度：高

ChatGPT
● 原账号环境
原来的账号、会话和工作目录保持不变。
[切换到 GitHub Copilot]

● Copilot Bridge 已就绪                         查看详情
```

Copilot 环境：

```text
GitHub Copilot
● 已连接
模型：GPT-5.6 Terra
推理强度：高

ChatGPT
● Copilot 环境
独立会话 · 独立工作区
当前模型：GPT-5.6 Terra
[恢复原账号]

● Copilot Bridge 正常                           查看详情
```

未连接时仅显示：

```text
GitHub Copilot
○ 未连接
连接你的 GitHub Copilot 账号后即可使用。
[连接 GitHub]
```

此时模型与推理强度必须隐藏。

## 56.3 单列环境卡

禁止同时展示 Original 与 Bridge 两个 Profile 卡。ChatGPT 区域只展示
当前环境的单张状态卡：

```text
ChatGPT
┌─────────────────────────────────────────┐
│ ● 原账号环境 / ● Copilot 环境             │
│ 当前环境说明                              │
│                                         │
│              主要切换操作                 │
└─────────────────────────────────────────┘
```

`danger-full-access` 权限说明不得永久显示在主页，不得以黄色大块警告占据
Card 高度。首次进入 Copilot 环境时显示一次权限说明 Modal；之后仅在设置
或诊断中查看，主页至多提供信息图标。

## 56.4 窗口与零滚动

正式默认窗口：

```text
width: 860px
height: 660px
minWidth: 820px
minHeight: 620px
center: true
maximized: false
```

主页面硬性要求：

```css
overflow: hidden;
```

正常情况下不得出现垂直或水平滚动条。默认启动后必须完整看见模型、
推理强度、当前 ChatGPT 环境、主要切换按钮和状态栏。

信息不足时，低频或一次性内容必须移入 Modal、Settings Sheet、
Diagnostics Dialog 或独立二级页面；不得将主页做成长页面。

高度预算：

```text
Title Bar                 48px
Top Padding               20px
GitHub Copilot Card      190px
Section Gap               22px
ChatGPT Card             165px
Status Bar                34px
Bottom Padding            18px
```

窗口缩小时依次减少上下 padding、Card padding（24px 至 20px）和
section gap（22px 至 16px），但不得允许主页滚动。

## 56.5 对话框、Sheet 与按需信息

OAuth 必须使用 GitHub Login Modal，显示公开设备代码、复制代码、已打开
浏览器状态和取消操作；成功状态显示约 800ms 后自动关闭。

首次 Bridge 初始化使用 Environment Setup Modal：

```text
设置 Copilot 环境
Copilot 将使用独立的会话和工作区，
不会删除或修改你的原账号数据。
[取消] [创建并继续]
```

切换超过 500ms 显示 Progress Dialog，按步骤显示：

```text
正在准备 Copilot
✓ 检查 GitHub Copilot
✓ 启动 Copilot Bridge
◌ 准备 ChatGPT
请稍候…
```

重启使用 Restart Dialog，不允许出现 `I restarted Windows`：

```text
应用新的环境
Copilot 环境已经准备完成。
Windows 需要重新启动一次，才能让 ChatGPT 使用新的环境。
[稍后] [重新启动 Windows]
```

应用下次启动时必须检查 pending transaction；确认成功后显示 Toast：

```text
✓ 已切换到 Copilot 环境
```

Settings 使用右侧 Sheet，可在其中滚动；Diagnostics 使用 Modal，可在
其中滚动。它们不得使主页增高。

## 56.6 可访问性与 DPI 验收

必须支持键盘 Tab、Enter/Space、Esc 关闭 Modal、可见 focus ring 与 ARIA
label。颜色不得成为唯一状态标识。

UI-4 验收必须在真实 packaged portable EXE 的 100%、125% 和 150% DPI
下分别截图。任意截图出现主页水平或垂直滚动条即 UI-4 FAIL。

UI-4 最低验收：

```text
[ ] 默认 zh-CN
[ ] 无英文临时文案
[ ] 860×660 默认窗口完整显示
[ ] 820×620 完整可用
[ ] 100% / 125% / 150% 无主页滚动条
[ ] 仅单列 GitHub Copilot Card + ChatGPT Card + Status Bar
[ ] Original 与 Bridge 模式各只显示一张 ChatGPT 状态卡
[ ] 权限说明不永久占主页
[ ] OAuth 使用 Modal
[ ] Restart 使用 Modal
[ ] Settings 使用 Sheet
[ ] Diagnostics 使用 Modal
[ ] 核心操作无需滚动即可看到
```

## 56.7 实施优先级

本补充覆盖此前旧英文双列布局。UI-2 和 UI-3 后，UI-4 必须按本节实现；
不得保留当前英文双列 Profile 卡、巨大 Hero Title、独立技术状态卡或主页
黄色权限块。

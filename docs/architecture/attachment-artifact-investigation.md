# ChatGPT 图片、文件与 Artifact 能力调查

## 调查范围与结论状态

调查日期：2026-09-22。

本阶段只进行了源码阅读、已存在 Desktop session metadata 分析和最小官方
Copilot SDK probe。没有重写 Responses provider、Tool Bridge、聊天 UI、
Asset Server 或文件管理器。

状态说明：

- **已观测**：来自当前安装的 ChatGPT Desktop session metadata、真实
  packaged Bridge，或真实 SDK probe。
- **已验证**：具有可重复的真实 probe 结果。
- **未知**：当前 Desktop/custom provider 下尚未得到实际 wire 证据。
- **未验收**：代码存在或 WIP 存在，但未能通过 build/typecheck/真实 E2E。

当前 Windows 重启会触发 `0x139` / `0x109` 系统级蓝屏，且当前 Bridge
Profile 的完整 Desktop custom-provider 附件 E2E 不宜再次通过重启触发。
因此所有需要重新进入 Bridge Desktop 环境的上传测试明确标记为待测。

## 1. 当前 Desktop Attachment 行为

### 1.1 已观测 PNG 粘贴输入

Bridge Profile session 文件记录了一个真实图片输入。其同一 user message
包含：

```text
input_text
input_image
```

结构化元数据表明：

```text
input_text:
  - "# Files mentioned by the user" 文本
  - Desktop 临时本地 PNG 路径
  - <image ... path="C:\Users\HP\AppData\Local\Temp\codex-clipboard-...png">

input_image:
  image_url: data:image/png;base64,...
```

Desktop session metadata 还标记：

```text
content_item_kinds:
  user.text
  user.image
```

结论：

```text
PNG 输入是混合模式（Mode D）：
Desktop 生成本地临时文件路径
+ Desktop 同时保留 input_image data URL
+ user prompt 包含文件 mention / image path
```

这证明附件至少会进入 Codex/Desktop 的 Responses 输入历史。当前没有保存
原图内容到本调查文档。

### 1.2 Ctrl+V、拖入、文件选择的区分

| 操作 | 当前证据 | 结论 |
| --- | --- | --- |
| Ctrl+V 粘贴 PNG | 观察到 `codex-clipboard-*.png`、本地临时路径和 `input_image` | 已观测 |
| 拖入 PNG | 未进行 custom-provider Desktop wire 捕获 | 未知 |
| 选择 PNG 文件 | 未进行 custom-provider Desktop wire 捕获 | 未知 |

现有 `codex-clipboard-*` 命名强烈符合粘贴板路径，但不应用名称代替正式
操作级验证。

### 1.3 普通文件输入

当前 Bridge session 历史没有确认以下类型通过 custom provider 时的完整
request item：

```text
PDF
TXT
CSV
XLSX
DOCX
PPTX
```

已有 session 中可见 README 和 XLSX 的文字提及，但没有确认其中存在：

```text
input_file
file_id
file_data
file_url
```

因此以下判断仍待真实 Desktop 上传 probe：

| 文件类型 | 当前 custom-provider wire 模式 |
| --- | --- |
| TXT / MD / JSON | 未知 |
| CSV | 未知 |
| XLSX | 未知 |
| PDF | 未知 |
| DOCX | 未知 |
| PPTX | 未知 |

当前可用无敏感 probe fixtures：

```text
C:\Users\HP\Documents\CopilotBridgeAttachmentProbe\
  attachment-sample.txt
  attachment-sample.csv
  attachment-sample.xlsx
  attachment-sample.docx
  attachment-sample.pptx
  attachment-sample.pdf
```

这些是最小测试资产，不是产品代码或用户文档。

## 2. 当前 Responses Wire Format

### 2.1 使用的入口

当前 Codex provider 路由：

```text
POST /v1/responses
GET  /v1/models
GET  /health
GET  /bridge/models
```

相关文件：

```text
upstream-copilot-sdk-proxy/src/providers/codex/provider.ts
upstream-copilot-sdk-proxy/src/providers/codex/handler.ts
upstream-copilot-sdk-proxy/src/providers/codex/schemas.ts
```

### 2.2 已观察到的图片 item

当前 Desktop session 确认存在：

```json
{
  "type": "input_image",
  "image_url": "data:image/png;base64,..."
}
```

同一消息也带含本机临时路径的 `input_text`。

### 2.3 ATT-2/3 前的正式 Proxy 基线

已发布/验收的 Codex prompt formatter：

```text
upstream-copilot-sdk-proxy/src/providers/codex/prompt.ts
```

核心行为是：

```text
只提取内容项中的 text 字段
将 text 拼接为 prompt
```

因此：

| Input item | 当前正式行为 |
| --- | --- |
| `input_text` | 保留 |
| `input_image` data URL | 不作为 SDK attachment 转发 |
| 文本内 local path | 作为文本路径保留，但不保证模型读取 binary |
| `input_file` | 没有已验证的转发 |
| `file_id` | 没有解析、下载或转发 |
| 未知 content item | formatter 不保留其二进制语义 |

结论：

```text
当前正式 Bridge 会丢失图片/文件的二进制输入语义。
```

这解释了“截图/文件上传后，Provider 只看到文字或路径提示”的问题。

### 2.4 已完成的最小 AttachmentResolver

当前 proxy 已实现最小附件转发：

```text
extractResponsesAttachments()
session.send({ prompt, attachments })
```

其行为为：

- 从 Desktop image tag / file mention 提取明确给出的绝对路径；
- 将 `input_image` data URL 转成 SDK blob attachment；
- 将 data URL 文件转成 SDK blob attachment；
- 对路径和内联数据限制为 10MB；
- 仅接受图片、文本/代码、CSV、PDF、DOCX、XLSX、PPTX、ZIP 等
  明确允许的扩展名或 MIME；可执行文件和未知内联 MIME 不转发；
- 当 Desktop 同时提供 local path 与相同图片 data URL 时优先 local path，
  避免二次上传。

Proxy build/typecheck、focused provider regression、真实 SDK/Responses probe
均已通过。该实现不重写 Tool Bridge continuation，也不替代尚未完成的真实
Desktop ATT-1/4 E2E。

## 3. 当前 Proxy 支持情况

### 3.1 Responses 与 Tool Bridge

已验证且本阶段不应重写：

```text
Responses SSE
function_call
function_call_output
call_id correlation
same Copilot SDK session continuation
Desktop read/edit/shell/npm test
```

附件应该在此边界之前转换：

```text
Responses request input
  -> Attachment Compatibility Layer
  -> session.send({ prompt, attachments })
```

不应改变：

```text
Tool Bridge continuation
pending-tool RPC
outer tool executor
```

### 3.2 服务器与 request body

`server.ts` 的 Fastify request body 由 schema 验证后交给 Codex handler。
当前没有独立上传 endpoint、multipart parser、asset database 或文件管理器。

这符合当前本地模式：Desktop 已能给出本地路径/data URL 时，Bridge 应复用
已有输入而不是重新建立网盘式 upload 服务。

## 4. Copilot SDK 图片与文件能力

### 4.1 SDK API

官方 `@github/copilot-sdk` 当前 `MessageOptions` 支持：

```ts
session.send({
  prompt: string,
  attachments: [
    { type: "file", path, displayName? },
    { type: "directory", path, displayName? },
    { type: "selection", filePath, displayName, selection?, text? },
    { type: "blob", data, mimeType, displayName? }
  ]
})
```

### 4.2 真实 SDK probe

两个最小 probe 都使用当前已登录的官方 Copilot runtime、真实
`gpt-5.6-terra` SDK session：

| Probe | Attachment | 结果 |
| --- | --- | --- |
| TXT | path-backed `attachment-sample.txt` | 模型返回 `ATTACHMENT_TEXT_OK` |
| PNG | ChatGPT Desktop 创建的临时 `codex-clipboard-*.png` | 模型返回 `ATTACHMENT_IMAGE_OK` |

结论：

```text
Copilot SDK 当前支持 path-backed 文本/文件附件。
Copilot SDK 当前支持 path-backed 图片输入。
```

这是已验证的 SDK 能力，不代表当前 Bridge 已完成附件转发。

### 4.3 Vision capability

Bridge 当前 `/bridge/models` 只返回：

```json
{
  "id": "...",
  "supportsReasoningEffort": true
}
```

它没有向 App 暴露 SDK 的 vision/file capability，即使 SDK model metadata
可能包含该信息。未来 Provider capability model 应增加：

```text
supportsVision
supportsImageInput
supportsFileInput
supportsPdfInput
supportsFunctionCalling
supportsToolContinuation
supportsImageGeneration
supportsArtifactOutput
```

在未验证 provider capability 前，不应在 UI 承诺所有模型都可理解图片或
文件。

## 5. 普通文档的实际路径

### 当前结论

普通文档的 custom-provider wire format 尚未得到真实 Desktop probe。

因此不能断言它是 Mode A、B、C 或 D。

但现有架构和 PNG 证据支持以下优先级：

```text
优先复用 Desktop/Codex 已提供的本地路径或本地附件
  -> local Codex filesystem/tool 按需读取
  -> 仅在当前 Provider 必须获得二进制时转 SDK attachment
```

### 类型级建议

| 类型 | 当前建议 |
| --- | --- |
| TXT / MD / JSON / source code | 本地路径 + 文本/工具按需读取优先 |
| CSV | 本地工具或轻量 structured parser 优先 |
| XLSX | 本地 spreadsheet tool / range tool 优先 |
| PDF | 本地 page-text / page-image tool fallback；小文件可 provider attachment |
| DOCX | 本地 document tool / paragraph-table extraction fallback |
| PPTX | 本地 slide text / note extraction fallback |

这不是已完成实现，而是基于隐私、带宽和上下文控制的推荐。

## 6. Artifact 输出的实际路径

### 已有证据

现有 Bridge session metadata 中的 `response_item` 类型只有：

```text
message
function_call
function_call_output
reasoning
```

没有观察到：

```text
artifact
output_file
container_file
file_citation
image_generation
```

Desktop Agent 的已验证输出主要是：

```text
Codex 本地 CommandExecution
-> 本机文件系统路径
-> 文字回答
```

已有 session 中能观察到本地 PNG 路径被工具读取，但没有证明 custom
provider 返回原生下载卡或缩略图。

### 当前结论

| 输出能力 | 结论 |
| --- | --- |
| 本地生成 TXT / CSV / XLSX / PDF / DOCX / PPTX / ZIP | 可由本地 Codex tool 生成，尚未逐类型 E2E |
| 在文字中说明本机输出路径 | 可行 |
| ChatGPT Desktop 原生下载卡 | 未知 |
| ChatGPT Desktop 原生图片缩略图 | 未知 |
| 自定义 provider 输出 artifact item | 未观察到当前可用 wire contract |

第一版输出策略应是：

```text
可靠本地生成
+ Agent 文字说明文件名/位置
+ 本地工具继续可读取、修改、打开
```

不要在未调查 Desktop artifact wire contract 前承诺原生下载卡。

## 7. 原生下载卡可行性

当前结论：

```text
UNKNOWN
```

原因：

- 当前 Responses output schema/streaming 只实现 message、function call、
  reasoning；
- 当前 session metadata 没有观察到 artifact/file-card response item；
- 未获得 Desktop custom provider 返回 file citation / container file /
  artifact 后实际 UI 的真实证据；
- app-server schema 虽包含多个 filesystem/artifact 相关能力，但没有证明
  custom Responses provider 可通过当前 endpoint 触发 Desktop 文件卡。

必须做的独立 PoC：

```text
本地 Agent 生成 test.txt / test.csv / test.xlsx / test.pdf / test.png
  -> 观察 Desktop 画面
  -> 记录 response item、annotation、file citation、app-server request
```

在此之前，不能开发或承诺 ArtifactResolver 的原生下载卡。

## 8. Local / Remote 职责边界

### Local Client

应负责：

```text
Desktop attachment 路径解析
本地临时文件读取
本地 size/mime validation
本地 Codex filesystem/shell/document tools
本地 artifact 文件生成
必要时向远程 Gateway 发送受限 temporary asset
```

### Provider Adapter

应负责：

```text
判断 provider 是否原生支持 image/file input
将 CanonicalAttachment 转为 provider-native attachment/input
不支持时请求本地 DocumentResolver / tool fallback
声明 provider capabilities
```

### Remote Gateway

应负责：

```text
model reasoning
session management
streaming
provider adapter
临时、加密、限时 asset relay（仅必要时）
```

不得负责：

```text
执行客户端 shell
读取客户端任意路径
直接获得本机 filesystem 权限
```

## 9. 对候选方案的评价

### AttachmentResolver

结论：

```text
建议做，且应是最小下一层。
```

理由：

- 当前 Desktop 已产生混合输入；
- 当前 formatter 丢二进制语义；
- SDK 有明确 attachment API；
- 需要统一 local path / inline data URL / future remote asset。

初版 CanonicalAttachment 可缩小为：

```ts
type CanonicalAttachment =
  | { kind: "file"; path: string; displayName?: string }
  | { kind: "blob"; data: string; mimeType: string; displayName?: string };
```

不要一开始实现 URL 抓取、remote asset、永久 ID、文件管理器。

### DocumentResolver

结论：

```text
仅 fallback，不应成为当前 Bridge 主路径。
```

理由：

- 本地 Desktop/Codex 是工具执行方；
- 大文件不适合 base64 进入 Responses；
- 当前已验证的架构擅长本地工具按需读取；
- PDF/XLSX/DOCX/PPTX 实际 Desktop wire 仍未知。

后续当某 provider 不支持某类文档时，再增加本地：

```text
search_document
read_document_section
read_pdf_pages
read_spreadsheet_range
```

### ArtifactResolver

结论：

```text
现在不应实现为完整子系统。
```

先做本地文件创建和文本路径反馈的真实 E2E；等确认 Desktop 原生 artifact
wire contract 后再决定是否需要 Resolver。

### Remote Asset Store

结论：

```text
LATER
```

仅当 Remote Gateway 或 provider 必须获得原始二进制时增加。不是本地模式
的前置条件，也不是网盘功能。

## 10. 推荐最终架构

### 当前本地模式的最小改动架构

```text
ChatGPT Desktop
  -> Codex Responses request
  -> Attachment Compatibility Layer
       - 提取 Desktop local temp path
       - 提取 input_image / input_file data URL
       - 路径、大小、MIME allowlist
  -> Current Responses Provider
  -> Copilot SDK session.send({ prompt, attachments })
  -> GitHub Copilot model

需要本地工具时：
GitHub Copilot
  -> current Tool Bridge function_call
  -> ChatGPT/Codex local tool execution
  -> function_call_output
  -> same Copilot SDK session continuation
```

### 大文档模式

```text
ChatGPT Desktop local file
  -> local Codex/document tool reads only requested range/page/section
  -> current Tool Bridge
  -> provider model
```

### 未来 Remote 模式

```text
ChatGPT Desktop
  -> local Client Bridge / AttachmentResolver
  -> authenticated HTTPS Gateway
  -> Provider Adapter / Copilot SDK

本地 Codex 继续执行 filesystem、shell、patch、npm test。
```

## 11. 文件级改动清单

| 文件 | 当前职责 | 建议修改 | 是否必须 | 风险 |
| --- | --- | --- | --- | --- |
| `upstream-copilot-sdk-proxy/src/server.ts` | health、models、本地 HTTP 路由 | 当前本地图片/文件最小转发无需修改；未来可增加受限 attachment diagnostics | 否 | 低 |
| `upstream-copilot-sdk-proxy/src/copilot-service.ts` | SDK client/session/model | 继续复用，不应重写 | 否 | 高：改错会破坏已验证 session/runtime 行为 |
| `upstream-copilot-sdk-proxy/src/providers/codex/provider.ts` | Codex Responses/Tool integration | 在 send 前构造 attachment-aware message | 是，最小附件支持 | 中 |
| `upstream-copilot-sdk-proxy/src/providers/codex/prompt.ts` | Responses input 转 prompt | 提取 CanonicalAttachment；保留文本 prompt | 是，最小附件支持 | 中：需防路径泄露/大文件 |
| `upstream-copilot-sdk-proxy/src/providers/codex/handler.ts` | request 验证和 pipeline | 将请求附件传给 streaming/bridge 参数 | 可能 | 低 |
| `upstream-copilot-sdk-proxy/src/providers/codex/streaming.ts` | 非工具流 send | 接受 `MessageOptions` | 是，最小附件支持 | 低 |
| `upstream-copilot-sdk-proxy/src/providers/codex/tool-bridge.ts` | function-call continuation | 初始 `start()` 接受 `MessageOptions`，continuation 不变 | 是，最小附件支持 | 中 |
| `upstream-copilot-sdk-proxy/src/providers/shared/streaming-core.ts` | session send/stream loop | 接受 `MessageOptions` 或新增兼容包装 | 是，注意 OpenAI/Claude provider 兼容 | 中 |
| `copilot-bridge-app/electron/bridge-manager.ts` | 本地 proxy 生命周期 | 无需修改本地附件第一阶段 | 否 | 低 |
| `copilot-bridge-app/electron/main.ts` | App IPC/系统集成 | 无需修改本地附件第一阶段 | 否 | 低 |
| `copilot-bridge-app/electron/preload.cts` | App IPC API | 无需修改本地附件第一阶段 | 否 | 低 |

## 12. 复杂度评估

| 能力 | 复杂度 | 主要不确定性 |
| --- | --- | --- |
| PNG 输入 | Medium | Desktop local path/data URL 提取与真实 custom-provider E2E |
| PDF 输入 | Medium | Desktop wire format、provider 原生 PDF 支持、页面级 fallback |
| XLSX 输入 | Medium | Desktop wire format、工作簿按需读取策略 |
| DOCX 输入 | Medium | Desktop wire format、段落/表格 fallback |
| PPTX 输入 | Medium | Desktop wire format、slide/notes fallback |
| 本地输出 PNG | Low | 本地生成路径已可由 Codex tools 处理；Desktop preview 仍未知 |
| 本地输出 XLSX | Medium | 工具生成可行；Desktop 下载卡仍未知 |
| 原生 ChatGPT 下载卡 | Unknown | custom provider artifact/file-card wire contract 未知 |
| Remote Gateway Asset | High | TLS、设备认证、带宽、临时对象、撤销、隐私、provider binary requirements |

## 13. 推荐 PoC 顺序

```text
ATT-0
冻结当前附件 WIP，完成当前行为/协议文档

ATT-1
PNG Desktop custom-provider wire probe：
Ctrl+V、拖入、文件选择三种操作分别记录 input items

ATT-2
TXT / CSV / XLSX / PDF / DOCX / PPTX Desktop custom-provider wire probe：
仅记录 item type、local path/data URL/file_id、provider request metadata

ATT-3
最小 AttachmentResolver：
Desktop path/data URL -> SDK MessageOptions.attachments
保留现有 Tool Bridge

ATT-4
PNG 与 TXT 真实 Desktop E2E：
确认模型可理解附件内容

ATT-5
大文档本地工具 fallback PoC：
PDF 页、XLSX range、DOCX paragraph、PPTX slide

ATT-6
本地 artifact 输出 probe：
TXT/CSV/XLSX/PDF/PNG，调查 Desktop card/download wire

ATT-7
仅在 provider binary requirements 证明必要后，设计 Remote temporary asset
relay
```

### Local MVP workflow result (2026-09-23)

The existing Tool Bridge is sufficient for the tested local workflow without
a ResourceRegistry or specialized spreadsheet tool:

- 4,000-line pasted text: hidden marker found after 20 ranged `read_file`
  calls;
- TXT, Markdown, JSON, and TypeScript: hidden markers found through
  `read_file`;
- CSV and text/source: read, analyze, edit, create, and disk reread passed;
- XLSX: read, analyze, modify, create, and reopen verification passed through
  a fixture-scoped external command and local Python/openpyxl;
- arbitrary undeclared paths remained unauthorized;
- all harness proxy processes, ports, and temporary fixtures were cleaned up.

The marker-hidden PNG SDK path regression also passed. These are workflow and
SDK results, not Desktop artifact-card or Desktop UI E2E results. The latter
remain blocked by `BLOCKER-003`.

## 14. 最终技术原则评价

候选原则：

> 文件输出优先在客户端本地生成。文件输入优先复用
> ChatGPT/Codex 本地附件和本地工具能力。只有图片或 Provider 必须取得
> 原始 binary 时，才通过 Bridge/Gateway 传输 Asset。

结论：

```text
部分同意。
```

理由：

- **同意本地生成输出优先**：当前已验证的 Tool Bridge 明确由 local
  ChatGPT/Codex 执行工具，天然适合本地生成文件。
- **同意输入优先复用本地能力**：图片 evidence 已显示 Desktop 给出本地
  temp path；SDK 也支持 path attachment。
- **补充条件**：小型图片和小型文件可直接作为 SDK attachment；不应要求
  所有 binary 都走本地工具。
- **不同意“只要图片才传 binary”这一绝对表述**：provider 也可能需要
  小型 PDF/DOCX/XLSX 原始内容才能原生理解，是否传输必须由 capability、
  文件大小、隐私和 local tool 可用性共同决定。
- **大文件不应 base64 放入 Responses**：应采用本地按需工具或后续
  temporary remote asset relay。

## 15. 调查限制

本阶段没有完成以下真实操作，因此不能把结果升级为 PASS：

```text
Desktop custom provider 下拖入 PNG
Desktop custom provider 下文件选择 PNG
PDF/TXT/CSV/XLSX/DOCX/PPTX 上传 wire 捕获
Agent 创建 test.txt/test.csv/test.xlsx/test.pdf/test.png 的当前 Desktop
artifact UI 观察
custom provider 原生下载卡/图片缩略图 PoC
```

这些 probe 需要稳定的 Bridge Desktop 环境。当前系统 restart BugCheck 是
独立阻塞，恢复后应按 ATT-1 至 ATT-6 执行。

## 16. ATT-2 / ATT-3 实现与验证

ATT-2/3 已完成最小化并重新验证：

```text
Desktop local file mention -> SDK file attachment
input_image data URL -> SDK blob attachment
普通 streaming -> MessageOptions
Tool Bridge 首轮输入 -> MessageOptions
Tool continuation -> 未修改
```

| Check | Actual | Result |
| --- | --- | --- |
| Source build/typecheck | Proxy build 和 `tsc -p tsconfig.check.json` 成功 | PASS |
| Focused regression | Codex prompt、Tool Bridge、Codex integration、model routing 共 46 项通过 | PASS |
| Provider forwarding regression | Responses `input_image`/Desktop path 到 `session.send({ prompt, attachments })` | PASS |
| Type/MIME policy | 可执行文件、未知 inline MIME 被拒绝；允许类型和大小有单测 | PASS |
| Full proxy regression | 405/408 通过；3 个既有 Windows path separator 断言失败 | BASELINE |
| Real TXT attachment | Responses SSE 返回 `ATTACHMENT_TEXT_PROXY_OK` | PASS |
| Real local-path PNG | 模型读取图片文字并返回 `ORANGE-714` | PASS |
| Real data-URL PNG | 模型读取图片文字并返回 `ORANGE-714` | PASS |
| Packaged Bridge smoke | 新构建的 `win-unpacked` Bridge `/health` 返回 HTTP 200、protocol 3 | PASS |
| Packaged TXT path attachment | 打包 Bridge 返回 SSE，但模型无法读取 fixture 内容 | BLOCKED |

对同一 Desktop 图片同时存在 local path 与 data URL 的情况，resolver 优先
path-backed attachment，避免二次重复上传相同图片。

这些结果证明 Attachment Compatibility Layer 的 request 解析、SDK message
构造和 proxy-level probes 可工作，但不替代 ATT-1 的三种 ChatGPT Desktop
输入方式或 ATT-4 的 Desktop end-to-end 验收。最新打包 App probe 还显示
TXT path attachment 在该运行配置中不能被模型实际读取，因此不能作为已发布
的附件能力宣称成功。

## 17. ATT-1 / ATT-4 当前阻塞

当前系统 restart 会触发 `0x139` / `0x109` Windows kernel BugCheck，Bridge
Profile 重新进入 Desktop custom-provider 环境需要 restart。因此以下真实
Desktop 验收暂时阻塞：

```text
Ctrl+V PNG
拖入 PNG
文件选择 PNG
PNG 内容理解
TXT 内容理解
```

在 Windows restart 稳定后，应使用本调查文档列出的 probe fixtures 执行
ATT-1 与 ATT-4，不能以当前 direct proxy probe 代替 Desktop PASS。

## 18. 打包 Bridge TXT 读取差异

使用新构建的 `win-unpacked` Bridge（`/health` 为 HTTP 200、protocol 3），
直接向 `/v1/responses` 发送包含
`C:\Users\HP\Documents\CopilotBridgeAttachmentProbe\attachment-sample.txt`
的 Desktop-style file mention。请求正常返回 SSE，但模型未返回 fixture 中的
`alpha beta gamma`，而是说明无法访问 tagged/attached file content。

尝试仅批准 SDK `read` permission、并仅对该明确 attachment path 注册及限制
`read_file`，仍未解决读取；该未证实的权限扩展已撤回，未进入最终代码。

结论：当前 resolver 传递已验证，但 packaged runtime 的 Copilot document
attachment consumption 仍是附件发布 blocker。下一步必须在稳定 Desktop
custom-provider 环境中抓取 runtime attachment events，并确认官方 SDK/runtime
所需的 native-upload 或 tagged-files 配置；不得通过启用 `["*"]` 内建工具来
绕过边界。

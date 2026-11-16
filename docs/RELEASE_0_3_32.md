# 0.3.32 / 0.3.33 每用户模型目录

## 目标

Cloud 模式下，ChatGPT 客户端只显示当前账号有权限的模型；模型与思考难度改在 ChatGPT 内选择，Bridge 不再提供重复的模型/思考下拉框。

## 实现

- Cloud `/v1/models` 增加 `display_name`、`context_window`、`max_output_tokens`、`effective_context_window_percent`（旧服务缺字段时使用保守回退）。
- 新增 `electron/model-catalog.ts`：把当前授权且 `READY` 的模型生成 Codex `model_catalog_json`。
  - 百炼默认 `1,000,000` 上下文、`75%` 可用（750K）。
  - 其他模型默认 `95%`，上下文取 Cloud 值；缺失时按命名空间回退。
  - 仅包含 `READY` 模型；不再显示原账号官方模型。
- Bridge 启用 Cloud 时写入 `model_catalog_json`，并把 `model` 设为当前可用模型。
- Bridge 每 5 秒同步授权目录；内容变化时静默重写 catalog 文件，并标记需要重启 ChatGPT，复用现有“重启 ChatGPT”提示。
- 请求路由优先采用 ChatGPT 请求中的 `model`；仅当它在当前授权目录内才接受。`bailian/`、`openai/`、`deepseek/` 命名空间的未授权模型返回 403，不会静默降级到其他模型。
- 旧客户端或旧会话发送官方 slug 时，回退到本地保存的默认模型。
- 恢复原账号时删除 `model_catalog_json`，保留用户原有配置。
- 移除 Bridge 的模型/思考模式下拉框，改为“模型与思考难度请在 ChatGPT 中选择”。
- 0.3.33：启动、切换开关和每 5 秒轮询都会对账 Bridge own 的配置；已激活但缺少 `model_catalog_json`、provider 地址/重试字段被改、默认模型失效时自动修复并提示重启。开关为 OFF 时只读，不写 `config.toml`。

## 验证

- App 306 项测试通过，包含 catalog 生成、配置写入/恢复、模型切换容忍、全量对账、请求路由授权与未授权拒绝。
- 使用真实 `codex debug models` 解析生成的 catalog：只输出 2 个 READY 百炼模型，上下文 1,000,000、有效 75%，GLM 停用项未出现。
- 未运行完整 ChatGPT GUI，未在真实用户机器上验证模型下拉刷新；catalog 变化后需要重启 ChatGPT 才会重新加载。

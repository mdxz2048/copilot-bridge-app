# 0.3.12 原账号旧会话恢复

关闭 Cloud 后，新会话默认 provider 已恢复为 openai，但旧会话仍记住 copilot_bridge_desktop。此前恢复配置时删除该 provider 定义，导致官方客户端报 Model provider not found，无法恢复旧会话。

恢复原账号配置时保留原始内容，并补充旧 provider ID 的 OpenAI 兼容定义：使用 OpenAI 原账号认证及自动选择 API/ChatGPT 端点，不保留本地代理地址、Cloud 认证 helper 或固定 Key。新会话默认仍是原账号。App 启动时也修复已经切回原账号的旧版本配置，重复执行幂等。不覆盖用户已有 provider 定义；原自定义 provider 的恢复行为保留。

不修改、迁移或删除会话记录、工作区和原账号认证文件。本机受影响配置已做备份并修复，不自动重启当前开发宿主。

回归覆盖八轮 ON/OFF、原始内容/注释/CRLF 保留、外部设置保留、写失败回滚、自定义 provider 保留、旧版本已关闭模式的修复。实际官方运行时使用隔离配置、合成凭据和受控上游复现旧 provider 错误，并验证同一保存会话恢复及新会话仍使用 openai。该测试不是 OpenAI 真实模型生成验收。

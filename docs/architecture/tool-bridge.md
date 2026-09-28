# Codex Tool Bridge

```text
Codex Agent
  | POST /v1/responses (tools)
  v
copilot-sdk-proxy + CodexToolBridge
  | declaration-only custom tools
  v
GitHub Copilot SDK session
  | external_tool.requested
  v
CodexToolBridge
  | Responses SSE function_call (call_id)
  v
Codex Agent executes the tool
  | POST /v1/responses (function_call_output, same call_id)
  v
CodexToolBridge
  | pending-tool RPC result, same SDK session
  v
GitHub Copilot SDK session
  | final assistant text
  v
Responses SSE response.completed
```

## Responsibilities

- **Copilot** decides whether a declared function tool is needed and performs
  model reasoning.
- **Codex** is the only tool executor. The bridge registers declaration-only
  SDK custom tools and does not attach handlers that access files, shells, or
  the network.
- **CodexToolBridge** translates SDK external tool requests into Responses
  `function_call` items, correlates `function_call_output` by `call_id`, and
  resumes the original SDK session through its pending-tool RPC.
- **The session** remains alive while waiting for tool results. A final
  `response.completed` is sent only after the resumed turn becomes idle
  without additional outstanding calls.

## Safety and lifecycle

Each bridge instance owns its pending calls and listener lifecycle. Client
disconnects abort the SDK session and reject pending calls. Pending calls have
a bounded timeout. Independent response conversations use separate bridge
instances, so tool results cannot cross session boundaries.

# Upstream Patch Record

## Phase 0 compatibility experiment

The locally cloned upstream validation copy was changed only to prove
compatibility with the installed official Copilot CLI runtime:

1. `CopilotService` accepts an explicit official runtime entrypoint and
   creates a `RuntimeConnection.forStdio` connection.
2. Built-in CLI tool allowlists use `ToolSet().addBuiltIn(...)` instead of
   the legacy bare `"*"` filter.

Reason: upstream v5.2.0's bundled runtime did not recognize the current
official CLI login state, and the current SDK rejects a bare wildcard.

These changes are now carried in the repository-owned
`vendor/copilot-sdk-proxy` snapshot and covered by its tests.

## Required Codex compatibility adapter

The tested Codex CLI Agent workflow exposes a missing behavior in
`copilot-sdk-proxy`: function-call output items from the outer Responses
client are not connected to the Copilot SDK session. The MIT-licensed
`xcode-copilot-server` reference demonstrates the required narrow adapter:

1. Emit Responses `function_call` output items when the Copilot session asks
   for a tool.
2. Route the outer Agent's tool result back to the waiting session.
3. Continue the same session until it reaches an actual completion event.

Only this generic event/continuation behavior may be reused. Xcode settings,
launchd handling, and Apple-specific code must not be copied.

The implemented adapter is in
`vendor/copilot-sdk-proxy/src/providers/codex/tool-bridge.ts`. The vendored
upstream MIT license is preserved.

# System Architecture

```text
ChatGPT Desktop
  | Responses API
  v
Copilot Bridge
  |- Profile Manager
  |- Model Router
  |- Transaction and Backup Manager
  |- Desktop Runtime Launcher
  `- copilot-sdk-proxy + Codex Tool Bridge
       |
       v
  GitHub Copilot SDK
       |
       v
  GitHub Copilot
```

The Electron renderer is UI-only. All runtime, filesystem, profile, HTTP,
Copilot SDK, and Desktop process work stays in the future main process.

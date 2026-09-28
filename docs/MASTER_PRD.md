# Copilot Bridge Master PRD

## Product

Copilot Bridge is a Windows 10/11 desktop application that lets a user switch
ChatGPT Desktop's Codex Agent between their Original ChatGPT/Codex environment
and an independent GitHub Copilot environment. The first release performs this
switch with a persistent user-level `CODEX_HOME` selection and a required
Windows restart or sign-out/sign-in. The release artifact is
`CopilotBridge.exe`.

The product hides provider, SDK, Responses API, CODEX_HOME, SQLite, and tool
bridge details. Users see only GitHub Copilot connection, model selection,
current environment, switch, and restore.

## UI / UX

UI design and interaction's single source of truth is
[UI_UX_PRD.md](./UI_UX_PRD.md). If any other document conflicts with it,
`UI_UX_PRD.md` takes precedence.

## Product Continuation

The expanded first-release product scope, ChatGPT bootstrap requirements,
startup/tray requirements, local/remote backend boundary, and staged
development order are defined in
[PRODUCT_CONTINUATION_PRD.md](./PRODUCT_CONTINUATION_PRD.md). Where it
conflicts with earlier product-scope assumptions, it takes precedence.

## Core product rules

- Original is user-owned: never delete, clear, overwrite, relocate, or log out
  of its authentication. The product never edits Original to switch profiles.
- Bridge is a durable independent environment under
  `%USERPROFILE%\.copilot-bridge\profiles\bridge\codex-home`.
- Original and Bridge isolate config, sessions, history, SQLite state, cache,
  skills, MCP state, recent workspaces, and project state.
- Bridge Profile currently uses the user-selected permanent
  `danger-full-access` Desktop permission mode with `on-request` approvals.
  The application must disclose this host-access scope before activation and
  provide a restricted alternative; Original Profile remains unchanged.
- Switching records the previous user-level `CODEX_HOME`, sets or clears that
  value, persists the intended profile and restart-required state, and validates
  the effective profile after the next restart. It never deletes profile content.
- Import is opt-in and copy-only. Local session import stays unavailable until
  its runtime schema is proven safe.
- Copy-only import is not part of the first release.

## Integration

- Use the official GitHub Copilot SDK and pinned
  `copilot-sdk-proxy` as the Responses API core.
- Authenticate GitHub Copilot inside CopilotBridge. The application starts the
  official device-code OAuth flow, displays the code and verification URL,
  opens the default browser, and waits for completion before enabling Bridge.
  Users must never need to run PowerShell, invoke a CLI, copy a token, or
  disclose a credential to the application.
- Package and explicitly select the official Copilot runtime used for that
  application-managed login. Do not silently depend on a separately installed
  global CLI or its credential store.
- Support `/v1/responses`, `/v1/models`, and `/health`; retain streaming,
  reasoning, tool calls, cancellation, and same-session continuation.
- ChatGPT/Codex executes agent tools. Copilot decides when tools are needed.
  The bridge only declares and relays tools.
- The UI-selected Copilot model may differ from an internal Codex
  compatibility model.
- A persistent user-level `CODEX_HOME` is the first-release profile backend.
  The Store Desktop shell inherits it after Windows restart or re-login.

## Phase 0 acceptance

The deterministic fake-directory PoC passed on 2026-09-21:
`npm test` reported 16 passing checks and zero failures. It covers both swap
directions, 20 complete cycles, all five persisted journal stages and their
crash recovery, move rollback, missing inputs, simulated Windows
locked/readonly errors, fake session isolation, and `PRAGMA quick_check` on
separate SQLite files. The run used only POC-created directories; it did not
access `%USERPROFILE%\.codex`, original authentication, or sessions.
The fake active, profile, staging, and state directories ran on the shared
`E:` NTFS volume.

The physical-directory backend is retained only as a Fake PoC. Real Original
directory rename consistently returns `EPERM` and is not a release backend.

The persistent user-level `CODEX_HOME` backend was validated in both
directions: after setting the variable and restarting, normal Store Desktop
launch populated Bridge Home; after clearing it and restarting, normal launch
wrote to default Original Home. The five Bridge databases and six Original
databases passed read-only `PRAGMA quick_check`. Original naturally updates
runtime state when the user launches it, so a post-launch hash difference is
evidence of Original activation, not a Bridge write.

The local authenticated Responses E2E also passed on 2026-09-21: the server
listened only on `127.0.0.1:8787`, returned health protocol version 3, and
returned HTTP 200 with `response.completed` for a real streamed response.
Its log confirmed that the Codex-facing compatibility model `gpt-5.5` created
a Copilot SDK session using backend model `gpt-5.6-terra`. This is not yet
Desktop Responses E2E; that still requires Bridge Home activation and a normal
Store Desktop request.

## UX and release

- Electron, React, TypeScript, and Vite are the intended product stack.
- The initial Electron/React/Vite application shell implements the local
  Profile switch journal and restart-required UX. Device-code OAuth UI and
  packaged runtime orchestration remain implementation work.
- The main window is simple, approximately 860x600, with no sidebar.
- UI, tray, packaging, and release work begin only after Desktop Profile
  Isolation, Desktop Responses, Desktop Tool E2E, and Session Isolation pass.
- Final release must run as a per-user NSIS-installed application without
  separately installed Node, npm, VS Code, or Copilot CLI. Portable EXE output
  is development-only because its self-extraction delays startup.

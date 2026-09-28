# Development Changelog

## 2026-09-28

### Added

- Added a repository-owned, pinned MIT `copilot-sdk-proxy` source snapshot so
  GitHub clones do not depend on a neighboring working tree.
- Moved project documentation into the App repository and added a portable
  Windows development guide.
- Added Windows GitHub Actions validation and NSIS workflow artifacts.
- Added Server Contract `2.2.0` baseline metadata and stable Copilot provider
  error parsing.

### Changed

- Replaced `file:../upstream-copilot-sdk-proxy` with
  `file:vendor/copilot-sdk-proxy`.
- Updated Cloud contract/version checks from `2.1.0` to `2.2.0`.

## 2026-09-24

### Added

- Added Contract `2.1.0` registration-time optional referral forwarding.
- Added Shadow billing response parsing for rated points, charged points,
  billing mode, request ID, remaining points, and settlement status.
- Added installed-App settlement lookup and Production Shadow acceptance
  coverage.

### Changed

- Updated the complete V2 error enum and exact Error response parsing while
  retaining the separately frozen Gateway V1 compatibility shape.
- Updated account usage to continue displaying Server-charged points only;
  rated Shadow points never reduce the displayed wallet.

### Verified

- Typecheck, clean build, and all 23 Desktop tests passed.
- Loopback Gateway regression passed all 23 auth/model/response/tool/error
  gates.
- Final NSIS-installed Production App passed Contract `2.1.0` login, account,
  device, subscription, provider, wallet, referral, JSON/SSE, usage,
  settlement, refresh, and Account UI.
- Shadow settlement passed with rated `1`, charged `0`, status `SHADOW`, and
  wallet `10000 -> 10000`.

## 2026-09-23

### Added

- Added UI/UX V2 provider, model, account, points, device, usage, and referral
  domain models plus a replaceable product-account API/Mock boundary.
- Added a distinct ChatGPT Bridge environment switch, compact account status,
  provider switch confirmation, GitHub subscription preflight, detailed
  Device Flow states, and a Server-backed device list.
- Confirmed the existing stable random `deviceId` is the Server V2
  installation UUID; no duplicate installation identifier is retained.
- Added typed V2 HTTP methods for registration, wallet/ledger, request
  settlement, device rename/revoke, referral, managed providers/models, and
  DeepSeek BYOS connections.
- Added production V2 probe coverage for wallet, ledger, usage, devices,
  referral, providers/models/connections, AI response, and settlement lookup.
- Fixed a startup race where an overlapping stale refresh error could reset
  Cloud auth while a successful login was registering its device.
- Replaced the technical dual-surface UI with a product-facing current AI
  service card, first-run onboarding, AI service selector, and structured
  settings.
- Added complete user-facing Cloud states and account/subscription/usage
  presentation with progress, billing-cycle dates, device state, renewal,
  upgrade, retry, account, and Local fallback actions.
- Added transactional Local/Cloud switching with model validation and rollback.
- Added real installed UI screenshot checks at 100%, 125%, and 150%.
- Added production/development/test Cloud configuration boundaries. Packaged
  builds default to `https://ai.mddxz.top`, development supports an explicit
  override, and test mode rejects non-loopback URLs.
- Added installed production E2E through the real NSIS-installed
  renderer/main process and localhost Remote Bridge.
- Added the contract-backed Desktop `HttpCloudClient`, Zod wire validators,
  Windows Credential Manager token adapter, stable device identity, localhost
  Remote Bridge, Server model catalog switching, and real account/service UI.
- Added the Desktop Mock Cloud E2E harness covering JSON/SSE Responses,
  sequential local read/edit/shell tools, error states, release lookup, token
  rotation, and usage settlement.
- Expanded `scripts/file-workflow-harness.mjs` into a marker-hidden Local MVP
  acceptance harness for pasted text, TXT, Markdown, JSON, TypeScript, CSV,
  and XLSX.
- Added fixture-root-only `read_file`, `write_file`, and constrained
  `run_command` execution to the test harness. `run_command` accepts only one
  Python script located under the temporary fixture root.
- Added an arbitrary-path regression proving that ordinary user text such as
  `C:\Users\HP\.ssh\id_rsa` does not register a production attachment.

### Changed

- Reduced the window to 760x560 (minimum 720x520) and moved account management
  out of the home visual hierarchy.
- Replaced user-facing token counts with Server-provided used AI credit shown
  as used points. Remaining points are withheld until Server supplies them.
- Simplified Settings to ChatGPT, startup/tray, appearance, diagnostics, and
  about.
- Renamed normal UI concepts to “我的 GitHub Copilot” and
  “Copilot Bridge 云服务”; protocol/runtime terminology remains diagnostics-only.
- Account refresh now uses the authoritative account snapshot and deduplicates
  concurrent refreshes.
- Existing settings migrate as onboarding-complete; only a new settings store
  shows first-run onboarding.
- Credential Manager targets now include both Cloud host and Desktop
  user-data profile, preventing refresh tokens bound to one device profile
  from being reused by another.
- Second-instance and tray activation now create the main window when the app
  started through `--autostart` without one.
- Removed the unused experimental text-inline prompt formatter and its
  superseded tests. Production continues to use `formatResponsesPrompt`;
  images remain on the SDK attachment path.

### Tested

- Production TLS Cloud E2E passed login, device, account, Pro subscription,
  usage, Server models, JSON/SSE, read/edit/shell continuation, final marker
  propagation, token rotation, logout rotation, timeout/disconnect, and usage
  settlement without Mock-only headers.
- Final NSIS install passed. Installed production default, account UI,
  management action, Remote Bridge, models, text, SSE, refresh, autostart,
  tray background behavior, single instance, native close-to-tray, reopen,
  Bridge restart, and Local/Remote model separation passed.
- Desktop typecheck/build and 13/13 tests passed after production fixes.
- Desktop Cloud E2E passed all 23 gates. The final same-thread answer included
  marker-hidden local read output `CLOUD-TOOL-731`, the verified edit marker,
  and shell output. Usage increased from 7 to 13 requests and 251 to 492
  tokens.
- Cloud auth, device, account, Pro subscription, model catalog, client config,
  release, timeout/disconnect, device revocation, subscription expiry, quota,
  refresh rotation, and logout rotation all passed against the real loopback
  Mock Server.
- Desktop build/typecheck and 11/11 unit/regression tests passed. Server
  contract tests passed 3/3, API tests passed 12/12, and Server contract/API
  typechecks passed.
- FILE-0A through FILE-0G workflow E2E passed with 44 external tool calls.
  The 4,000-line pasted-text fixture required 20 ranged reads and returned its
  hidden marker.
- TXT, Markdown, JSON, and TypeScript hidden-marker reads passed.
- CSV read/analyze/modify/create and TXT/source edit/reread passed with disk
  verification.
- XLSX read/analyze/modify/create passed through external Tool Bridge calls
  and local Python/openpyxl. Both `sales.xlsx` and `result.xlsx` reopened with
  Bob's value set to 10000.
- Same-session continuation and sequential tool calls passed. Every temporary
  fixture directory was removed, every proxy exited, and every allocated port
  closed.
- Marker-hidden PNG SDK path regression passed with `ORANGE-714`.
- Focused prompt and Tool Bridge suite passed 29/29; typecheck, build, and
  changed-file formatting checks passed.
- Full proxy suite passed 406/409. The remaining three failures are the known
  pre-existing Windows path-separator assertions in `test/config.test.ts`.

## 2026-09-21

### Added

- Generic Codex Tool Bridge with correlated `function_call_output` resume.
- DesktopLaunchProbe self-contained EXE.
- Desktop runtime, tool bridge, and Phase 0 acceptance evidence.
- Formal project documentation structure.
- Phase 0C functional-first decision: closed-Desktop, same-volume physical
  Codex Home swaps replace direct Desktop `CODEX_HOME` injection as the
  first-release dependency.
- BLOCKER-002 for safe disposable-directory physical-swap validation; the
  previous Desktop attachment investigation is now non-blocking.

### Tested

- Tool Bridge and Codex regression suites: 54 tests passed.
- PhysicalDirectorySwapBackend Fake PoC: 16 checks passed, zero failures.
  The run covered 20 cycles, all five journal stages and crash recovery,
  move rollback, missing paths, simulated Windows locked/readonly move
  errors, fake session isolation, and separate SQLite `quick_check`.
- Official Copilot SDK streaming Responses request and tool continuation.
- Desktop bundled app-server `CODEX_HOME` isolation.
- Normal-user DesktopLaunchProbe direct Store launch attempt.

### Found

- ChatGPT Desktop uses bundled Codex 0.155.0-alpha.9.2.
- Direct WindowsApps executable launch is denied before desktop startup.
- Bundled app-server honors isolated `CODEX_HOME`.
- Desktop app-server daemon control is unavailable and its generated schema
  exposes no confirmed Store Desktop profile/home override.
- Desktop app-server proxy only attaches to an existing control socket; it
  does not provide Store Desktop startup or environment injection.
- The authorized Agent-context real `.codex` rename returned `EPERM`, but the
  physical backend journal recovery preserved Original metadata and returned
  active state to `original`.
- The same `EPERM` occurred in normal-user context; the persistent LocalSystem
  `CodexSandboxService.OpenAI.Codex` is the lock candidate.
- Administrator validation stopped and restored the sandbox service, but the
  real `.codex` rename still returned `EPERM`; journal recovery again
  preserved Original metadata.
- A post-reboot administrator retry produced the same failure while preserving
  Original metadata and restoring the sandbox service.
- A persistent user-level `CODEX_HOME` set to
  `C:\Users\HP\.copilot-bridge\profiles\bridge\codex-home`, followed by a
  Windows restart and normal Store Desktop launch, created Bridge-only state
  and SQLite files without changing Original's pre-launch baseline.
- Clearing that user-level variable, restarting, and launching normally wrote
  back to default Original Home. Five Bridge and six Original SQLite databases
  passed read-only `PRAGMA quick_check`. Original's runtime config hash and
  timestamp changed during its own normal launch, so post-launch differences
  are not attributed to Bridge.
- Added configurable per-provider `backendModel` routing. In the dedicated
  Phase 0 E2E configuration, Codex-facing `gpt-5.5` is routed to Copilot SDK
  backend `gpt-5.6-terra` while built-in Copilot CLI tools are disabled.
- Local authenticated Responses E2E passed with a real HTTP 200 SSE response,
  `response.completed`, health protocol version 3, and a runtime log proving
  the compatibility-to-Terra route. It is not a Desktop E2E result.
- Confirmed that the SDK-bundled runtime did not see the global CLI's login
  state. Explicitly selecting the authenticated official runtime succeeded;
  the product requirement is now application-managed device-code OAuth.
- Completed real Store ChatGPT Desktop Responses E2E. After Bridge Home
  activation and restart, Desktop reached localhost and returned the requested
  exact response. Logs recorded both `gpt-5.6-luna` and `gpt-5.5` Desktop
  client requests, routed to `gpt-5.6-terra`; Bridge Home state was updated.
- Full proxy regression run: 399/402 tests passed. The three failures are
  existing Windows-only path separator assertions in `test/config.test.ts`
  that expect POSIX `/project/...` paths but receive `E:\project\...`.
- Fixed a Desktop-exposed Tool Bridge race by batching external tool requests
  across adjacent event-loop ticks for 25 ms before ending the function-call
  SSE response. Added a regression test for delayed calls in the same tool
  round. Targeted Tool Bridge/model-routing tests passed 15/15; typecheck and
  build passed.
- At the user's direction, set the Bridge-only Desktop permission policy to
  `danger-full-access` with `on-request` approvals. Removed the temporary
  per-project writable-root policy and retained a pre-change config backup.
- Real Desktop Agent Tool E2E passed: Desktop read `math.js` and
  `package.json`, applied the `left - right` to `left + right` patch through
  its tool executor, received correlated function outputs, and ran `npm test`
  successfully in the `E:` sample project.
- Final full proxy regression run: 400/403 tests passed. The remaining three
  failures are the same pre-existing Windows path separator assertions in
  `test/config.test.ts`.
- Completed bidirectional real Desktop session-isolation validation. Bridge
  started with six session files/index entries; after Bridge → Original →
  Bridge switching across restarts, those counts remained six while Original
  retained its independent 128 session files and 119 index lines. Normal
  launches updated only the active profile's global state. Six SQLite
  databases in each profile passed final read-only `PRAGMA quick_check`.
- Completed bidirectional real Desktop workspace-isolation validation. A
  Bridge-only sentinel was recorded in two Bridge session files and absent
  from Original sessions; an Original-only sentinel was recorded in one
  Original session and absent from Bridge sessions. Bridge finished with eight
  session/index entries, Original with 129 session files and 120 index lines,
  and both profiles' six SQLite databases passed final `PRAGMA quick_check`.
- Deferred optional Phase 0H copy-only import from the first release.
- Scaffolded `copilot-bridge-app` as an Electron, React, TypeScript, and Vite
  application. Its typed main/preload IPC exposes profile status, activation,
  and restart acknowledgement. The Profile Store uses an atomic local journal
  and persistent user-level `CODEX_HOME` registry values; its test passed with
  a fake user environment. Device-code OAuth UI/runtime orchestration remains
  pending and is not represented as a completed feature.
- Added application-owned device-flow orchestration around the official
  Copilot runtime: typed IPC starts `copilot login`, reports only public
  device-code/verification-URL status, opens the verification URL once, and
  never reads or copies a token. It is implemented and unit-tested; a
  real fresh-login acceptance run remains pending.
- Bundled official `@github/copilot` runtime version 1.0.75 into the portable
  Electron build rather than using a globally installed CLI. `npm test` (two
  tests), typecheck, and production build passed. `electron-builder` produced
  and smoke-started `Copilot Bridge 0.0.0.exe`; its packaged resources include
  `copilot-runtime/copilot.exe` version 1.0.75.
- Changed release delivery from portable EXE to an NSIS per-user installer.
  `Copilot Bridge Setup 0.1.0.exe` was built, installed, and launched through
  desktop/Start Menu shortcuts. The installed executable ran from
  `%LOCALAPPDATA%\Programs\Copilot Bridge`; its app-managed Bridge returned
  health `ok` and 11 real models. Portable output remains development-only
  because it self-extracts at every launch.
- Added the complete UI/UX specification at `docs/UI_UX_PRD.md` and made it
  the overriding UI/UX source of truth from `MASTER_PRD.md`.
- Fixed UI-0 packaged renderer blank. Electron had loaded an ESM preload as a
  CommonJS preload, producing `Cannot use import statement outside a module`
  and leaving `window.copilotBridge` undefined. The preload now compiles as
  `preload.cjs`. A real portable packaged instance exposed the expected DOM
  and a captured screenshot confirms the renderer is no longer blank. No
  UI-1 menu/title-bar or visual redesign work was started.
- Completed UI-1. `Menu.setApplicationMenu(null)` removes the default Windows
  `File / Edit / View / Window` menu. A real portable desktop screenshot
  verifies the menu is absent while native window controls remain available.
- Completed UI-2 through UI-4 visual foundations under `UI_UX_PRD.md`.
  `titleBarOverlay` retains native window controls and a custom 48px visual
  title bar. The renderer is now default Chinese, single-column, has no Hero
  title, no active-profile technical card, no dual Profile cards, and no
  persistent unrestricted-access warning. Portable checks at 100%, 125%, and
  150% confirmed no main-page overflow. Authentication state and models are
  not yet connected to the UI and remain later stages.
- Implemented UI-5 through UI-11 MVP plumbing. The app now has reusable
  Button/Select/Toggle/Modal/Sheet controls, typed IPC for Bridge status,
  settings and models, a bundled Node runtime, and a BridgeManager that
  starts the packaged `copilot-sdk-proxy` with the explicitly packaged official
  Copilot runtime. Added `/bridge/models` to return real SDK model IDs plus
  reasoning-effort capability without changing Responses or Tool Bridge.
- Real portable verification passed: app-managed proxy health returned
  protocol version 3; `/bridge/models` returned 11 models (7 supporting
  reasoning); renderer persisted `gpt-5.6-terra` plus `high`, restarted the
  proxy, and retained health. UI reflects actual Bridge status rather than
  React-only state. Fresh device-login and app-driven profile-switch/restart
  E2E remain pending.
- Added `PRODUCT_CONTINUATION_PRD.md` as the expanded product-development
  specification. It introduces official ChatGPT bootstrap, Original state
  handling, startup/tray requirements, and staged Local/Remote backend plans.
- Recorded Windows restart kernel failures as BLOCKER-003. Automatic restart
  is disabled in source pending authorized dump attribution and restart
  stability.
- Implemented ChatGPT bootstrap foundations: Windows PowerShell AppX package
  detection, StartApps launch identity retrieval, official `winget msstore`
  install request with Microsoft Store fallback, and official app launch IPC.
  Real detection against `OpenAI.Codex 26.915.4065.0` passed. Installation E2E
  remains pending because the current machine already has ChatGPT installed.
- Added Original Profile `UNINITIALIZED`, `READY`, and `CUSTOM` state
  detection plus persistent custom `CODEX_HOME` restoration coverage.
- Added single-instance enforcement, tray lifecycle scaffolding, close-to-tray
  behavior, user-level login-item registration, and persisted startup
  settings. Packaged tray/startup acceptance remains pending.
- Implemented official ChatGPT install progress flow: `NOT_INSTALLED` now
  exposes a four-stage Modal, invokes only Microsoft Store `winget`, falls
  back to the official Store page after timeout, polls registration, refreshes
  App state after installation, and supports cancellation without leaving
  `winget` child processes.
- Completed ATT-2/3 attachment compatibility implementation. Codex Responses
  now converts Desktop-style local file mentions into SDK file attachments and
  `input_image` data URLs into SDK blob attachments, preferring a local path
  when Desktop provides both. Shared streaming remains compatible with plain
  string senders; Tool continuation was not changed. Real SDK probes passed
  TXT, local PNG, and data-URL PNG forwarding; focused regression passed 43
  tests and full proxy regression remained 402/405 with existing Windows path
  separator failures.
- Verified an isolated packaged App instance: the real ChatGPT detector
  returned package/version/AppID, Diagnostics reported Bridge/Profile/settings
  state, and two launches resulted in exactly one main process.
- Added StartApps/activation-registry fallback for packaged ChatGPT detection.
  The fallback verifies installed status and a launchable official package
  family/AppID without displaying an unreliable historical activation version.
- Completed startup/tray implementation foundations: strict single-instance
  handling, close-to-tray behavior, tray status/menu, persisted auto-launch,
  auto-Bridge-start and minimize-to-tray settings. Settings-only changes no
  longer restart Bridge unnecessarily.
- Hardened the ATT-2/3 AttachmentResolver with a 10MB limit and conservative
  extension/MIME allowlist. Unsupported executable files and unknown inline
  MIME types are not forwarded. Added provider-level coverage proving a
  Desktop attachment reaches `session.send({ prompt, attachments })`; focused
  regression is 46/46, and full proxy regression is 405/408 with only the
  three existing Windows path-separator baseline failures. Rebuilt the NSIS
  installer and verified the packaged Bridge `/health` endpoint (HTTP 200,
  protocol 3).
- Investigated a packaged TXT path-attachment failure. The App Bridge returns
  normal SSE but the model cannot read the fixture content. A tightly scoped
  `read_file` permission experiment did not resolve it and was removed rather
  than widening built-in tool access. This remains an explicit attachment
  release blocker; the final focused attachment regression is 75/75.

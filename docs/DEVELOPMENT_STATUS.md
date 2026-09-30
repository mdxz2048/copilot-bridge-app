# Development Status

Updated: 2026-09-30

## Current Phase

Phase 0 - Product Integration Readiness

Status: V2.3 CLIENT TEST INSTALLER BUILT; INSTALLED ACCEPTANCE AND REAL PROVIDER PENDING

Current source status (mock/renderer verification, not a new installed-package
acceptance):

- Local GitHub Copilot works without Cloud registration. First-run completion
  waits for authentication, service/model readiness, and persisted settings.
  Switching ChatGPT environments stays visibly pending until the user saves
  work, exits ChatGPT, and manually signs out/in to Windows; no automatic
  restart is offered.
- Cloud account registration does not activate a subscription. An unentitled
  Desktop device login reports "未开通/待管理员开通" rather than a password
  error, keeps retry available, and links to the website account center when
  a trusted URL exists. TEST mode explains the missing website URL. Website
  QR codes are test placeholders, collect no payment, and cannot activate an
  account automatically; an administrator handles test activation.
- Referral UI can copy the code or a trusted website registration link and
  reports clipboard failures. Registration alone is not a reward; eligibility
  and credited points remain Server authoritative.
- Modal/Sheet focus, Tab containment, Escape behavior, and focus return have
  renderer regressions. Theme selection takes effect on the renderer and
  Electron title bar, follows system preference when selected, and persists.
  A signed-in Cloud session refreshes account/subscription/wallet/usage on
  window focus with concurrent/frequency limits; signed-out local use does
  not refresh Cloud on focus.
- V2.3 adds one P-256 installation key per Cloud client (Windows-user
  PasswordVault protected, not hardware attestation). DPoP signs bearer and
  refresh requests; the Server rejects a copied token or replay. The
  server-side Admin policy defaults to 2 new turns/minute/account and 1 new
  turn/minute/device. Remote Bridge accumulates parallel tool outputs locally
  before forwarding one complete signed continuation, so a single turn does
  not consume a second new-turn allowance.
- Full client tests **72/72**, local signed Cloud-to-Mock login, JSON/SSE,
  refresh and low-cap Remote Bridge tool continuation passed. The Server V2.3
  API was deployed for internal testing and a signed test-device JSON/tool
  request and SHADOW non-debit passed over production TLS. The unsigned 0.2.0
  NSIS test installer was built with SHA-256
  `f470859995fda95f45dd2a43dab66110ab5f79c76cc08c0e8fe04e39c3cf04e0`,
  but remains **uninstalled and unpublished**. The old published 0.1.0
  installer cannot authenticate to the current Cloud API. No real Windows
  sign-out/profile switch or real Copilot inference was validated in this
  round; commercial payment is still gated.

## Completed

- Moved all project PRD, architecture, acceptance, and handoff documents into
  the App Git repository.
- Vendored the pinned MIT `copilot-sdk-proxy` source and product patches under
  `vendor/`; a fresh clone no longer depends on a sibling checkout.
- Added a Windows GitHub Actions workflow for clean install, App validation,
  vendored Proxy tests, NSIS packaging, and installer artifact upload.
- Audited Contract `2.2.0`; no new route or DTO conflict was found. Desktop
  now parses `COPILOT_AUTH_EXPIRED` and `COPILOT_USAGE_UNAVAILABLE` and keeps
  Server-managed Copilot failures distinct from BYOS authentication.
- Completed the remaining frozen Desktop surfaces for Client Config, release
  checks, legacy request history, settlement-by-request/response lookup, and
  automatic post-response Wallet/Usage refresh.
- Provider-specific failures no longer sign out the Cloud account. The
  renderer now exposes Server-defined retry, reconnect, switch-provider, and
  update actions.
- Desktop-to-Server Mock Cloud E2E passed through the production CloudClient,
  Windows Credential Manager token boundary, stable device identity, and
  localhost Remote Bridge. Auth, device, account, subscription, usage, Server
  models, JSON/SSE Responses, release lookup, refresh/logout rotation, error
  states, and usage settlement passed.
- Cloud sequential read/edit/shell tool E2E passed. The hidden
  `CLOUD-TOOL-731` marker traveled only through local read output,
  `function_call_output`, and the final same-thread Cloud response. The edit
  was verified on disk and shell output was returned to Cloud.
- Product UX convergence passed for first-run onboarding, the single
  current-service main card, AI service selection, account/subscription/usage,
  all Cloud error states, Local connection failure, settings, and Dark Mode.
- Real installed renderer checks passed at 100%, 125%, and 150% with no main
  page overflow or technical terms in normal UI.
- Production TLS and NSIS-installed application E2E passed for login, device,
  subscription, usage, Server models, JSON/SSE Responses, account UI, account
  management, Bridge restart, startup, tray, close-to-tray, and single
  instance behavior.
- UI/UX V2 now uses a compact 760x560 window, an explicit ChatGPT Bridge
  environment switch, a low-emphasis account/subscription status line, and a
  provider/model-focused AI service card. The minimum 720x520 layout passed
  without visible scrolling.
- Provider and model domains are explicit. Cloud, GitHub Copilot, managed
  Provider catalogs/models, and DeepSeek BYOS APIs are integrated. Local Model
  remains disabled because Server local usage reporting is still pending.
- Account detail integrates Server V2 wallet balance, wallet transactions,
  V2 usage, devices, referral summary/history, and Provider connections.
- Contract `2.1.0` Drift Audit passed against the frozen Manifest, generated
  OpenAPI hash, shared Zod schemas, and Desktop adapters.
- The final NSIS-installed App passed Production Shadow E2E for login,
  account, device, subscription, provider catalog, wallet, referral, JSON,
  SSE, usage, settlement lookup, refresh, and Account UI.
- Installed Shadow evidence recorded `pointsRated=1`, `pointsCharged=0`,
  `billingStatus=SHADOW`, and wallet `10000 -> 10000`. Desktop displays
  charged points only and does not subtract rated points locally.
- Registration now forwards optional `referralCode`; Server remains
  authoritative for validation, atomic binding, qualification, and rewards.
- Pinned proxy core and generic Tool Bridge implemented.
- Tool Bridge and Codex regression suites: 54 tests passed.
- ChatGPT Desktop package and bundled Codex 0.155.0-alpha.9.2 identified.
- Bundled app-server honors isolated `CODEX_HOME` and creates Bridge-only
  SQLite/state data.
- Persistent user-level `CODEX_HOME` is inherited by normal Store Desktop
  activation after Windows restart.
- Bridge activation populated an independent Bridge Home; clearing the
  variable and restarting restored normal Original Home activation.
- Read-only SQLite `quick_check` passed for five Bridge and six Original
  databases after the reversible switch validation.
- Local authenticated Responses E2E passed: the Bridge listened on localhost,
  health returned protocol version 3, real SSE completed, and logged
  `gpt-5.5` compatibility routing to `gpt-5.6-terra`.
- A dedicated E2E configuration disables Copilot CLI built-in tools; no tool
  execution was used in the local Responses check.
- Real Store ChatGPT Desktop Responses E2E passed after Bridge Profile
  activation and restart. Desktop created Bridge Home state, reached
  `127.0.0.1:8787`, and received the requested exact text response. The proxy
  logged Desktop client requests with both `gpt-5.6-luna` and `gpt-5.5`, each
  routed to Copilot backend `gpt-5.6-terra`; one observed stream logged normal
  completion.
- Real Store ChatGPT Desktop Agent Tool E2E passed. The Agent read
  `math.js` and `package.json`, applied the minimal `left - right` to
  `left + right` patch through the Desktop tool executor, received correlated
  `function_call_output`, and continued the same turn to run `npm test`
  successfully.
- Bridge Profile is intentionally configured for permanent
  `danger-full-access` with `approval_policy = "on-request"` at the user's
  request. This applies only while the persistent user `CODEX_HOME` points to
  Bridge Home; Original Profile is unchanged.
- Real bidirectional session isolation passed. Switching Bridge to Original
  and back across restarts preserved Bridge's six session files and six index
  lines, while Original retained its distinct 128 session files and 119 index
  lines. Normal Desktop launches updated only the selected Profile's runtime
  state; all twelve checked SQLite databases remained valid.
- Real bidirectional workspace isolation passed. A Bridge-only workspace
  sentinel appeared only in Bridge session metadata and an Original-only
  sentinel appeared only in Original session metadata; both cross-Profile
  searches returned zero matches. The final Bridge activation retained eight
  Bridge session/index entries while Original retained 129 session files and
  120 index entries.
- PhysicalDirectorySwapBackend Fake PoC passed: 16 checks, zero failures,
  including 20 cycles, all journal-stage crash recoveries, rollback, fake
  session isolation, and separate SQLite `quick_check`.
- Normal-user DesktopLaunchProbe preserved Original metadata.

## Current Work

Next work is safe installed-package acceptance of the current Desktop source,
then approved real Windows/Cloud validation. Local device-code login, the
Electron/React shell, profile backend, and restart-required UX are implemented;
their earlier portable/installed results below are historical and do not
validate the latest package.

UI-0 packaged renderer blank is resolved. The root cause was an ESM
`preload.js` loaded by Electron as a CommonJS preload, which prevented
`window.copilotBridge` injection and crashed the renderer. The preload now
builds as `preload.cjs`; a real packaged renderer DOM check and screenshot
passed for that earlier build. Subsequent visual/UI stages described below
were implemented; their latest installed rendering needs revalidation.

UI-1 default Electron menu removal is accepted in a real portable screenshot.
The native Windows title bar and its minimize/maximize/close controls remain;
only the `File / Edit / View / Window` application menu was removed.

UI-2 through UI-4 visual foundations are accepted: the native Windows control
behavior is retained through `titleBarOverlay`; the main page uses the UI/UX
token foundation, default Chinese copy, one GitHub Copilot card, one current
ChatGPT-environment card, and a status bar. Earlier portable renderer checks
at 100%, 125%, and 150% observed no main-page overflow. Authentication,
model selection, settings, and modal workflows have since been implemented
and covered by mock/renderer tests; this is not a new installed visual check.

UI-5 reusable Button, Select, Toggle, Modal, and Sheet components now exist.
UI-7/UI-8 are connected to actual packaged Bridge data: the portable app
started the bundled proxy, health returned protocol version 3, `/bridge/models`
returned 11 SDK models, model selection persisted `gpt-5.6-terra`, and the
real capability data exposed the reasoning control. UI-11 BridgeManager is
implemented with bundled Node, proxy, and official Copilot runtimes; it
manages start, stop, restart, health, and model retrieval. UI-6 login Modal
and UI-9/UI-10 environment Dialogs are implemented but await their specific
real portable E2E flows.

## Current Blocker

The latest Desktop source still needs a fresh NSIS package/install and safe
real Windows/Cloud acceptance. Historical installed and Shadow results below
must not be treated as this iteration's release evidence. The deployed
website/API do not remove Docker real Copilot or commercial-payment gates.

## Installer Acceptance

The previously built Version 0.1.0 NSIS installer passed real installation
acceptance at the time. It installs per-user at
`%LOCALAPPDATA%\Programs\Copilot Bridge`, creates desktop
and Start Menu shortcuts, and starts the installed executable rather than the
portable `%TEMP%` extraction path. The installed app's Bridge health is `ok`
and its real model list contains 11 models.

No blocking profile-isolation issue is currently open. The former
physical-swap backend remains blocked and must not be used.

## Next

1. Package and inspect the current Desktop source as a fresh NSIS build;
   do not reuse historical installer hashes or claim the old package includes
   the recent UI/Cloud fixes.
2. With explicit approval and a safe isolated environment, verify real
   Windows sign-out/in, the pending environment state, theme/title bar, and
   the 720x520 window; do not switch the user's real profile for mock tests.
3. Validate the complete registered/unsubscribed/administrator-activated
   Cloud flow and real Provider/payment gates separately; do not infer them
   from mock or Shadow billing acceptance.

## Do Not Touch

- Tool Bridge
- `%USERPROFILE%\.codex` (except normal user-launched Desktop runtime writes)
- Original auth and sessions

## Product Continuation Update

The expanded product scope is defined in `PRODUCT_CONTINUATION_PRD.md`.
At the time of the Phase A evidence below, the implementation phase was
ChatGPT detection and official-install bootstrap. That is no longer the
current development phase; historical Profile/Responses/Tool Bridge E2E
remains valid for the build it tested.

### Restart Safety Blocker

Windows BugCheck events include `0x139 KERNEL_SECURITY_CHECK_FAILURE` and
`0x109 CRITICAL_STRUCTURE_CORRUPTION`; `0x139` predates the current
installer. Automatic `shutdown.exe` restart is disabled in application source
until authorized dump attribution identifies and resolves the system issue.
Restart-dependent E2E is blocked.

### Phase A Progress

ChatGPT Desktop detection is implemented and verified against the current
Windows Store package registration: `OpenAI.Codex`, version `26.915.4065.0`,
with a launchable StartApps AppID. The app implements official `winget msstore`
installation and Microsoft Store fallback, but official install E2E requires a
separate machine or clean uninstalled test environment and is not yet PASS.
Original state detection supports `UNINITIALIZED`, `READY`, and `CUSTOM`;
custom `CODEX_HOME` restoration has automated test coverage.

The official Store installation was exercised on this machine after ChatGPT
was removed: Store completed installation and direct AppX registration returned
`OpenAI.Codex 26.915.4065.0`. A detector ordering bug left the old test UI in
waiting state; the corrected packaged detector now returns the full installed
package identity/version/AppID. A fresh end-to-end recheck of automatic Modal
closure remains pending.

An isolated packaged App test confirmed the ChatGPT detector, diagnostics IPC,
single-instance lock, and default startup settings. Tray creation and
close-to-tray are implemented, but visual tray/auto-login acceptance remains
pending. Fresh install, zero-login, and every restart-dependent path remain
unaccepted.

Tray/auto-start implementation now uses a single-instance Electron lock,
close-to-tray behavior, a contextual tray menu, persisted startup settings,
and bundled Bridge auto-start. Settings changes only restart Bridge when
backend model, reasoning, or backend mode changes. Visual tray/auto-login
acceptance remains pending.

### Attachment Progress

ATT-2/3 attachment forwarding is implemented and validated through real
Copilot SDK/Responses probes: TXT path attachments, PNG local-path
attachments, and PNG data-URL blob attachments all reached `gpt-5.6-terra`.
The resolver now has a 10MB limit and a conservative extension/MIME allowlist;
executable files and unknown inline MIME types are rejected. The provider-level
test proves that a Desktop image reaches
`session.send({ prompt, attachments })`. Focused proxy regression passed
75 tests; full proxy regression remains 405/408 with the existing three
Windows path-separator baseline failures. A newly packaged `win-unpacked`
Bridge returned `/health` HTTP 200 with protocol version 3. However, its
direct TXT path-attachment probe returned normal SSE but did not expose the
fixture content to the model. Attachment parsing/wiring is therefore verified,
but packaged document consumption and ChatGPT Desktop ATT-1/4 remain blocked
by runtime investigation and restart stability.

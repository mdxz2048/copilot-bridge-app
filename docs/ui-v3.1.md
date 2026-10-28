# UED v3.1 implementation

This revision implements the approved interactive design in the existing React renderer. The main window stays vertical: the Cloud switch, compact account summary, service card with model/reasoning controls, bottom action, and status/announcements. It does not introduce a two-column wallet or a new client workflow.

## Function protection map

| Surface | Existing behavior retained | Presentation |
| --- | --- | --- |
| Main mode control | Confirm before changing configuration; ordinary login does not switch modes; cancelled login clears the pending intent; OFF remains independent of Cloud auth/network | Approved mode title and blue switch |
| Account summary | Server balance with four decimals, cycle spending, plan, direct recharge and account handlers | Compact horizontal summary |
| Models | Server-authorized model directory and advertised reasoning modes | Side-by-side selectors; keyboard arrows/Home/End/Escape and selected check |
| Settings | Existing auto-launch/tray/auto-Bridge handlers and persisted settings | Left navigation: Basic, Account, About |
| Settings account | Actual Cloud status and existing account dialog | Current account, authentication/lock status, account entry; no invented administrator permission |
| Software update | Existing UpdateManager subscription/check/download/install lifecycle; installation only after user confirmation; closing notes leaves background download running | Equal 32px toolbar controls, checking motion, real byte progress ring, ready dot/error state; centered status and actual current/target versions and release notes |
| Login | Saved-account selection, forgetting, password visibility, default remember=true, opt-out, secure-credential IPC | Shared inputs and compact dialog; no new credential persistence |
| Account/devices | Existing wallet, plan, invitation, history, device removal confirmation and current-device protection | Shared light/dark surfaces and safe scrolling |
| Recharge | Existing Xianyu purchase, order submission, server review, order/result notices | Existing real media/results retained; no synthetic payment or immediate credit |
| Invitation | Server-generated links/message, clipboard action and reward notices | Shared themed modal |
| Diagnostics/errors | Actual diagnostic data, failure feedback/support, complete long-error dialog | Readable label/value layout and semantic status |

## Theme compatibility

Only Light and Dark are offered. New settings default to Light. Reading a legacy `system` or unknown theme maps to Light without changing any unrelated configuration. Existing IPC persists user selections. Electron's native title-bar overlay uses the same Light/Dark foreground and surface colors as the renderer. No proxy, authentication, installer, or process-control behavior changes.

## Layout and validation

The actual window remains 900 × 700 with a 720 × 520 minimum. Main content, dialog bodies, and the settings right pane have their own bounded layouts; short windows retain model controls and the primary action. Every dialog keeps the existing focus-trap/restore hook.

Renderer regression coverage includes the two theme choices and persistence, legacy-theme compatibility, settings navigation and real account entry, absence of administrator affordances for ordinary users, remember-default opt-out, selector keyboard focus, current-version update layout, and the pre-existing mode/login/order/update tests.

Hover/pressed fills are scoped to enabled `.button` controls with low specificity. Text actions such as Recharge and Account, selectors, switches and toolbar controls retain their own surfaces. Browser regression checks exercise actual hover, pointer-down, keyboard focus and secondary buttons in both themes to prevent blue text being overpainted by a global blue fill.

Local browser screenshots use anonymous IPC fixture data for visual verification. They are not evidence of a real authenticated Cloud session, payment, installation, or official-client restart.

At the user's request, a local NSIS installer was built after the hover correction and installed over the existing all-users installation on 2026-10-28. All 56 renderer/main build files were compared byte-for-byte with the packaged and installed archive. Installer exit code was 0, and the actual installed executable opened a visible Copilot Bridge window. An obsolete 0.2.5 background instance was closed and its duplicate legacy startup entry removed; the current installation's startup entry remains. Local version stays 0.3.29; no release was uploaded/published and no Cloud service was deployed. Payment, official-client restart and the real updater download/install lifecycle were not exercised by this local installation check.

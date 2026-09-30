# DEVELOPMENT HANDOFF: Desktop UI/UX V2

Updated: 2026-09-30

## CURRENT SOURCE SNAPSHOT (UNRELEASED)

The published `0.1.0` installer, screenshots, historical Server commit/hash,
response IDs, and older NSIS hashes below are **not** acceptance of V2.3.
Website/API now require device DPoP; 0.1.0 Cloud can no longer log in.
An unsigned 0.2.0 internal-test NSIS was built locally, SHA-256
`f470859995fda95f45dd2a43dab66110ab5f79c76cc08c0e8fe04e39c3cf04e0`,
but has not been installed or published. Local signed Mock and production
test-device requests passed; this is not official binary attestation.

- Local GitHub Copilot onboarding does not require a Cloud account. First-run
  completion waits for authentication, model/service readiness, and saved
  settings. Profile changes remain visibly pending until a manual Windows
  sign-out/in; no automatic restart is performed.
- A newly registered Cloud account without a subscription cannot complete
  Desktop device login. The UI keeps a retryable "未开通/待管理员开通" explanation
  and a website account-center entry when configured; TEST mode has no site
  URL and says to contact an administrator. The website QR is a clearly
  marked test placeholder: it does not collect payment or auto-activate a
  subscription.
- Invite detail copies the code and, for an approved HTTPS site or loopback,
  the prefilled `/register?ref=` link, with success/failure feedback.
  Registration is not an immediate reward. Only Server-validated payment
  eligibility/rules and its ledger can confirm an award; a test placeholder
  or manual activation alone does not prove paid qualification.
- Modal/Sheet initialize and trap keyboard focus, expose dialog semantics,
  preserve applicable Escape behavior, and restore focus to a surviving
  trigger. Light/dark/system theme selection applies immediately and persists.
  An authenticated Cloud window refreshes account, subscription, wallet, and
  usage on return to foreground with deduplication and throttling; local-only
  users incur no focus-time Cloud refresh.
- Earlier targeted Desktop regressions **55/55**, build, and typecheck passed.
  Real Windows session/profile switch, real Cloud account, and a new
  NSIS-installed package have **not** been rechecked for this source. Docker
  real Copilot authorization/model access and commercial payment are still
  gated.

## PRODUCT UX

```text
Window Size:
PASS

Home No Scroll:
PASS

Cloud Home:
PASS

Local Home:
PASS

Service Switch:
PASS

Model Selector:
PASS

Reasoning Selector:
PASS

Account Card:
PASS

Account Detail:
PASS

Renew CTA:
PASS

Settings Simplification:
PASS
```

The home page now prioritizes:

1. Bridge environment switch;
2. compact Cloud account/subscription line;
3. current AI provider and model;
4. ChatGPT and provider-switch actions;
5. low-emphasis health/version/diagnostics.

Bridge environment and AI provider are separate dimensions. Without a pending
switch, Bridge off means ChatGPT uses Original account/configuration. After
selecting either environment the UI shows a pending state until the required
manual Windows sign-out/in; selecting it is not proof that the current
ChatGPT process has switched.

## ACCOUNT STATES

```text
Signed Out:
PASS

Authenticated:
PASS

Expired:
PASS

Quota Exceeded:
PASS

Device Revoked:
PASS

Server Offline:
PASS
```

Account detail displays Server-authoritative account, plan, period, used
credit as used AI points, device list/status, shortened device ID, and
subscription actions.

Server V2 integration status:

```text
Wallet Balance:       PASS
Wallet Transactions:  PASS
Referral Summary:     PASS
Referral History:     PASS
Device List:          PASS
Device Rename API:    PASS
Device Revoke API:    PASS (client + Server DB tests; production mutation not run)
Remaining Points:     PASS
```

## LOCAL

```text
Local Copilot:
PASS

Local Models:
PASS

Local Usage Message:
PASS
```

GitHub Device Flow includes requesting-code, waiting-for-user, verifying,
success, no-subscription, expired, network-error, and cancelled states. A
successful GitHub login is not itself treated as Copilot entitlement; model
catalog validation remains the activation gate.

## CLOUD

```text
Cloud Models:
PASS

Cloud Account:
PASS

Subscription:
PASS

Usage:
PASS
```

Cloud models remain Server authoritative. Desktop does not filter models by
plan. V2 wallet balance and points charged come directly from Server; Desktop
does not calculate balance, rating, rewards, or billing.

## PROVIDER MODEL

The client now centralizes:

- `AIProvider`;
- `ProviderConnection`;
- `AIModel`;
- `UserAccount`;
- `SubscriptionSummary`;
- `PointsBalance`;
- `DeviceSummary`;
- `UsageSummary`;
- `ReferralSummary`.

Integrated providers:

```text
Copilot Bridge Cloud
GitHub Copilot
DeepSeek BYOS (Contract/API/UI; real key E2E blocked)
```

Visible but disabled pending Contract support:

```text
Local Model
```

See `docs/UI_V2_MIGRATION.md` and `docs/protocol/CONTRACT_ISSUES.md`.

## RESPONSIVE

```text
760x560:
PASS

720x520:
PASS

100%:
PASS

125%:
PASS

150%:
PASS

Horizontal Overflow:
PASS

Main Vertical Scroll:
PASS
```

Real installed screenshots:

- `installed-v2-home-1x.png`
- `installed-v2-home-1_25x.png`
- `installed-v2-home-1_5x.png`
- `ux-v2-server-final/installed-cloud-main-1x.png`
- `ux-v2-server-final/installed-cloud-account-1x.png`
- `v2-1-shadow-final/installed-cloud-main-1x.png`
- `v2-1-shadow-final/installed-cloud-account-1x.png`

All installed capture checks reported no body/main overflow and no normal-UI
technical terms.

## REGRESSION

The GitHub source tree is now self-contained. Project docs and the pinned,
MIT-licensed Proxy source are committed inside the App repository, and the
Windows workflow builds them from a fresh clone.

```text
Typecheck:
PASS

Build:
PASS

Tests:
PASS (34/34, historical run; current targeted source run: 55/55)

Vendored Proxy:
PASS (409/409)

Local Regression:
PASS (29/29 focused Tool Bridge)

Cloud Regression:
PASS (Gateway compatibility + Production Contract 2.2 Shadow)

Runtime Server Integration:
PASS (Client Config, Release, Usage History, automatic Usage/Wallet refresh,
response/request settlement recovery, provider error actions)

Startup/Tray:
PASS (unchanged validated lifecycle)

NSIS:
PASS (historical package only; current source not packaged)

Installed Smoke:
PASS (historical package only; current source not installed)
```

The final NSIS-installed App passed Production Contract `2.2.0` login,
account, device, subscription, Provider catalog, wallet, referral, JSON, SSE,
usage, settlement lookup, refresh, and Account UI. Shadow evidence recorded
`pointsRated=1`, `pointsCharged=0`, `billingStatus=SHADOW`, and wallet
`10000 -> 10000`.

```text
Server Contract: 2.2.0
Server Commit: c987b4d77898595831f0c9e7740c71068a5e1646
OpenAPI SHA256:
c8039a458af1adf9af9863c2bce6d54c729c5bbc71bf173778ad4072cc7de090

Installed Shadow Response:
resp_cedcc7c83be9411abe65792a4badff64

AI Request:
a4a15376-724d-4e61-a992-0c67638bf854

Rate Card Version:
dcb6fae4-fe3a-4ed5-ac33-2618620497cb

APP_CONTRACT_CONFLICT:
NONE
```

## RELEASE (HISTORICAL SNAPSHOT; NOT CURRENT SOURCE)

```text
Git Worktree:
DIRTY

Files To Commit:
README.md
electron/cloud/cloud-client.ts
electron/cloud/cloud-error.ts
electron/cloud/cloud-foundation.ts
electron/cloud/contract.ts
electron/cloud/http-cloud-client.ts
electron/cloud/mock-cloud-client.ts
electron/cloud/product-account-api.ts
electron/cloud/remote-bridge-server.ts
electron/copilot-auth.ts
electron/main.ts
electron/preload.cts
electron/service-switcher.ts
electron/settings-store.ts
package.json
scripts/cloud-e2e-harness.mjs
scripts/cloud-v2-production-probe.mjs
scripts/installed-production-e2e.mjs
src/App.tsx
src/bridge-api.d.ts
src/components/AccountSummaryCard.tsx
src/components/CloudAccountSheet.tsx
src/components/CurrentServiceCard.tsx
src/components/ServiceSelectionSheet.tsx
src/domain/product-models.ts
src/style.css
test/cloud-foundation.test.mjs
test/profile-store.test.mjs
test/service-switcher.test.mjs

Files Excluded:
release/**
dist/**
dist-electron/**
dist-renderer/**
session screenshots
runtime logs
user data
credentials

Baseline Before This Integration:
62cebd54329a13299255b63828ece65f712a5ac5

Final Commit:
See repository HEAD

NSIS SHA256:
9595e05e7c5c3a24d9d70e28449d01a040de3620facaf1387f460d446c2ed3a5

Installed EXE SHA256:
75e5a246b948db6bce123a90bb6ff9bb9b538ef7b434ac4f324eb6b9700434d2
```

No release tag was created for the historical integration recorded here;
this line is not a statement about the separately published 0.1.0 installer.

## REAL CHATGPT DESKTOP

```text
BLOCKED
```

Persistent Bridge Home still requires Windows sign-out/in or restart before
the current ChatGPT Desktop process inherits it. `BLOCKER-003` remains open.

## REAL PROVIDER

```text
BLOCKED
```

The metered `mock/mock-chat` Provider passed Shadow acceptance. DeepSeek has
no production test key and Copilot requires interactive Device Flow, so
`REAL_PROVIDER_E2E` is not claimed.

## CURRENT BLOCKERS

1. `REAL_PROVIDER_E2E` is blocked by missing DeepSeek credentials and
   interactive Copilot Device Flow.
2. `ENFORCED` billing remains intentionally disabled and was not changed.
3. Production device slots are occupied and may not be silently revoked.
4. Local Model usage reporting remains `PENDING` in the Server contract.
5. Real ChatGPT Desktop still requires safe Windows sign-out/in or restart.

## CROSS_AGENT ACTION REQUIRED

No Server action is required for the Shadow gate. A real Provider test
credential or approved interactive Copilot authorization is required for the
separate `REAL_PROVIDER_E2E` gate.

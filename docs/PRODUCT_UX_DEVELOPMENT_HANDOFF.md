# DEVELOPMENT HANDOFF: Desktop UI/UX V2

Updated: 2026-09-24

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

Bridge environment and AI provider are separate dimensions. With Bridge off,
the UI states that ChatGPT uses Original account/configuration. With Bridge
on, ChatGPT uses the selected provider after the required Windows
sign-out/in or restart.

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
PASS (26/26)

Vendored Proxy:
PASS (409/409)

Local Regression:
PASS (29/29 focused Tool Bridge)

Cloud Regression:
PASS (Gateway compatibility + Production Contract 2.2 Shadow)

Startup/Tray:
PASS (unchanged validated lifecycle)

NSIS:
PASS

Installed Smoke:
PASS
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

## RELEASE

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

Current Commit:
e9242650f40d55fc17949899f5eb86c726f0ac03

NSIS SHA256:
27cb7a154fc0d8a316eb220bfbb919cca7423efc1404032fa98ad9157d468309

Installed EXE SHA256:
a16daa4e41e3ea3b9a922f0a74ac46d6ea4ab086b7be1d974a01d1ff2bc9faf6
```

No V2 commit or tag was created because the current task did not request one.

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

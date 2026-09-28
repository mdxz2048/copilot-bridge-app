# Production Integration Gate

Updated: 2026-09-23 16:45 +08:00

## Frozen Desktop baseline

```text
Repository: copilot-bridge-app
Branch: main
Desktop HEAD: 811d735943d70d8d93e472fb605232e24dd7fa80
Worktree: CLEAN
Final validated production source fingerprint:
365340c27e68dd0320dc383ec44ebb81eca641b8ed45ac83d324c03847062524
Fingerprint file count: 40
```

The validated Cloud implementation is not fully represented by the current
Desktop commit. The HEAD SHA must therefore always be read together with the
source fingerprint above. Do not claim that checking out the HEAD alone
reproduces the accepted Cloud implementation.

## Frozen Cloud contract

```text
Contract title: Copilot Bridge Cloud Desktop API
Contract version: 1.0.0
OpenAPI SHA256:
4c72178606ecd71ec047c9618e89eff6581e489f53d80ff54f4035d7152a2d85
```

Authoritative file hashes:

| Source | SHA256 |
| --- | --- |
| `GATEWAY_API_V1.md` | `5360525478924dddc27e24b427585a83a76ecd5f01bcc130f7cbc4ce45d2199b` |
| `DESKTOP_INTEGRATION.md` | `39cbab0874134ae939288ea27a8863db75d5efc569124fe0b4e415495f51632d` |
| `openapi.v1.json` | `4c72178606ecd71ec047c9618e89eff6581e489f53d80ff54f4035d7152a2d85` |
| `schemas.ts` | `ffed8986e142bca2a31d20feadcef8e4e7f2210deb1fa7a59591dd7c38d7347e` |

Any Production Integration Manifest with a different contract version or
OpenAPI hash must stop the gate for explicit reconciliation. Desktop must not
guess compatibility.

## Frozen validation state

```text
Desktop build/typecheck          PASS
Desktop unit/regression tests    13/13 PASS
Desktop Mock Cloud E2E           23/23 PASS
Local Tool Bridge regression     29/29 PASS
Server contract tests            3/3 PASS
Server API tests                 12/12 PASS
Server contract/API typecheck    PASS
Generated OpenAPI validation     PASS
```

Mock Cloud accepted:

- auth, refresh rotation, logout rotation;
- stable device ID, registration, listing, and revocation;
- account, Pro subscription, usage, models, client config, and release;
- Responses JSON and SSE;
- local read, edit, shell, sequential tool calls, function-call output, and
  same-session continuation;
- usage settlement;
- device revoked, subscription expired, quota exceeded, server unreachable,
  timeout, and disconnect behavior.

Do not rewrite or expand the accepted Mock Cloud or FILE-0 architecture during
the Production Integration Gate.

## Production Integration Manifest status

```text
PRODUCTION_INTEGRATION_MANIFEST: VALIDATED
Manifest SHA256:
8b8353ee80be272e10b5290d9610847bcabc31e390e255f3c769071adba9e813
SERVER_BASE_URL: https://ai.mddxz.top
CONTRACT_VERSION: 1.0.0
SERVER_COMMIT: 534cb791f2dc412722b1b14bc719d3e615a160eb
OPENAPI_HASH:
4c72178606ecd71ec047c9618e89eff6581e489f53d80ff54f4035d7152a2d85
PLAN: Pro test fixture
AVAILABLE_MODELS: mock/mock-chat
ACCOUNT_MANAGEMENT_URL: https://ai.mddxz.top/dashboard
```

The Manifest contract version and OpenAPI hash exactly match the frozen
Desktop contract. The production endpoint returned health HTTP 200 over TLS.

## Production and installed acceptance

Production TLS Cloud E2E passed without `X-Mock-Error-Code`:

- login, stable device registration, account, Pro subscription, and usage;
- Server-only `mock/mock-chat` model catalog;
- JSON and SSE Responses;
- refresh rotation, logout rotation, timeout, disconnect, and unreachable
  handling;
- local read/edit/shell continuation through localhost Remote Bridge;
- final same-session answer containing `CLOUD-TOOL-731`,
  `CLOUD-EDIT-482`, and `CLOUD-SHELL-913`;
- usage growth from 22 to 28 requests and 603 to 844 tokens during the final
  complete production harness run.

The final NSIS artifact and installation passed:

```text
Installer version: 0.1.0
Installer SHA256:
779229243a2bf5a9faf1f5291085f727cd25d03af489c37a76ea2cf648cefd90
Installed EXE SHA256:
2b15ff722d465a3a51a85a1eb24d632f299b9634bf1a507752c83856872f9904
```

The real installed renderer/main process passed production default, login,
device, subscription, usage, account UI, management action, Remote Bridge,
Server models, JSON, SSE, refresh, and Bridge restart.

Startup/tray regression passed:

- HKCU startup entry uses the installed EXE with `--autostart`;
- autostart launched hidden and restored Remote Bridge from Credential
  Manager;
- a second launch exited and opened the existing main instance;
- native `WM_CLOSE` hid the window while the process and Remote Bridge stayed
  alive;
- a later launch reopened the hidden single instance;
- Local mode returned only Copilot SDK models;
- Remote mode returned only `mock/mock-chat`.

Production, development, and test configuration are distinct. Packaged
production defaults to `https://ai.mddxz.top`; development can override the
base URL; test mode requires loopback. Credential Manager targets include the
Cloud host and Desktop user-data profile, preventing a token bound to one
device profile from being reused by another.

## ChatGPT Desktop gate blocker

The installed ChatGPT Desktop currently runs with Original Home even though
the persistent target is Bridge Home:

```text
User CODEX_HOME: C:\Users\HP\.copilot-bridge\profiles\bridge\codex-home
Effective current-session activation: pending sign-out/in or restart
Original model: gpt-6-sol
```

The localhost provider configuration exists in Bridge Home. Applying it to
the current Windows session requires restarting Windows or signing out/in.
The user selected not to perform that activation in this round.
`BLOCKER-003` also remains open for restart safety. Therefore no installed
ChatGPT Desktop Cloud read/edit/shell result is claimed.

## Frozen ownership boundary

```text
Desktop Agent: copilot_bridge only
Server Agent: bridge_manager only
```

When a Server contract problem is found, Desktop records a `CONTRACT_ISSUE`
and does not modify Server source.

## Current gate status

```text
STEP 1  Freeze validated implementation       PASS
STEP 2  Production Integration Manifest       PASS
STEP 3  Production/development/test config    PASS
STEP 4  Production account/service UI         PASS
STEP 5  Installed TLS Cloud E2E                PASS
STEP 6  ChatGPT Desktop Cloud tool E2E         BLOCKED BY PROFILE/RESTART
STEP 7  Remote Server models / Local models    PASS
STEP 8  Production error handling              PASS
STEP 9  Installer/startup/tray regression      PASS
STEP 10 Preserve Local Provider                PASS
```

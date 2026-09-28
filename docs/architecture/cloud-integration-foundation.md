# Cloud Integration

## Status

The Desktop-to-Server Mock Cloud integration is implemented and accepted.
The authoritative contracts are:

- `E:\0_code\3_lzp\bridge_manager\docs\protocol\GATEWAY_API_V1.md`
- `E:\0_code\3_lzp\bridge_manager\docs\protocol\DESKTOP_INTEGRATION.md`
- `E:\0_code\3_lzp\bridge_manager\docs\protocol\openapi.v1.json`
- `E:\0_code\3_lzp\bridge_manager\packages\contract\src\schemas.ts`

The Desktop does not infer network fields outside these sources. Contract
issues discovered during integration are recorded in
`docs/protocol/CONTRACT_ISSUES.md`; all four are resolved.

## Desktop boundary

`HttpCloudClient` owns all Cloud HTTP operations:

- login, refresh, and logout;
- current user and account;
- device registration and listing;
- subscription and usage;
- client configuration and model catalog;
- Responses JSON/SSE transport;
- latest release lookup.

The base URL is injected through `COPILOT_BRIDGE_CLOUD_BASE_URL`. Development
acceptance uses `http://127.0.0.1:3001`; no production URL is hardcoded into
the Desktop implementation.

Zod validators in `electron/cloud/contract.ts` mirror the frozen Server
schemas. Invalid success or error payloads fail as
`INVALID_SERVER_RESPONSE`; the client does not guess from messages.

## Authentication and token security

One explicit state machine owns Cloud authentication:

```text
SIGNED_OUT
AUTHENTICATING
AUTHENTICATED
DEVICE_REVOKED
SUBSCRIPTION_REQUIRED
SUBSCRIPTION_EXPIRED
QUOTA_EXCEEDED
SERVER_UNREACHABLE
```

- Access tokens remain in process memory.
- Refresh tokens are stored through Windows Password Vault, the Windows
  Credential Manager API boundary.
- Login and refresh implement refresh-token rotation.
- HTTP `TOKEN_EXPIRED` is refreshed and retried exactly once.
- Logout also rereads the rotated refresh token before its one safe retry.
- `MONTHLY_QUOTA_EXCEEDED` maps explicitly to the UI state
  `QUOTA_EXCEEDED`.

The password flows from the renderer to main-process login IPC and is not
persisted. Test credentials enter the E2E harness only through environment
variables.

## Device identity

`DeviceIdentityStore` creates one random UUID and persists only that UUID in
`cloud-device.json`. It does not use CPU, MAC, disk serial, or another
hardware fingerprint. Device registration sends the UUID, device name,
platform, OS version, and application version.

The E2E recreated the store from disk and confirmed the UUID did not change.
The Server returned the same active device identity. The renderer receives
the device name/status but not the device UUID.

## Localhost Remote Bridge

Cloud product traffic retains the required topology:

```text
ChatGPT Desktop
  -> http://127.0.0.1:8787 Local Bridge
  -> authenticated Cloud Gateway
```

`RemoteBridgeServer` exposes localhost health, models, and Responses routes.
It adds `Authorization`, `X-Device-ID`, and a stable
`X-Client-Thread-ID`. Function calls are returned to ChatGPT/Codex for local
execution. Their `function_call_output` items are correlated to the original
Cloud conversation and sent back with the same thread ID.

The existing Local provider and Codex Tool Bridge are retained unchanged.
`backendMode=LOCAL` uses the existing provider; `backendMode=REMOTE` uses the
Server model catalog and localhost Remote Bridge.

## Account and service UI

The “账号与服务” sheet uses real Server data for:

- account email;
- Standard/Pro plan;
- subscription state and expiry;
- monthly percentage, request count, and token usage;
- current device activation;
- Cloud service state.

It never exposes access/refresh/provider tokens, internal user ID, device ID,
or Gateway details.

## Accepted E2E

The production Desktop classes were exercised against the loopback Mock
Server through `scripts/cloud-e2e-harness.mjs`. The harness passed:

- login, token rotation, logout rotation, and Credential Manager storage;
- stable device UUID, registration, listing, and revocation;
- account, Pro subscription, usage, client config, models, and release;
- JSON text and SSE event ordering/completion;
- timeout, disconnect, and unreachable transport handling;
- `SUBSCRIPTION_EXPIRED`, `MONTHLY_QUOTA_EXCEEDED`, and `DEVICE_REVOKED`
  state transitions;
- three sequential local tools: read, edit, and shell;
- marker-hidden read result `CLOUD-TOOL-731` returned through
  `function_call_output` and present in the final same-thread answer;
- disk verification of the local edit;
- request and token usage settlement.

The last recorded usage delta was 7 to 13 requests and 251 to 492 tokens.

## Remaining product work

- Production TLS/Gateway deployment and release-gate validation.
- Real installed Electron/ChatGPT Desktop Cloud-mode UI acceptance.
- Account-management URL/action when defined by product configuration.

These do not block the Mock Cloud architecture acceptance.

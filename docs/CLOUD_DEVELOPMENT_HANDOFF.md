# DEVELOPMENT HANDOFF: Desktop Cloud Integration

## Release status

```text
DESKTOP_SERVER_AUTH_E2E          PASS
DESKTOP_SERVER_DEVICE_E2E        PASS
DESKTOP_SERVER_MODELS_E2E        PASS
DESKTOP_SERVER_TEXT_E2E          PASS
DESKTOP_SERVER_SSE_E2E           PASS
CLOUD_LOCAL_READ_TOOL_E2E        PASS
CLOUD_LOCAL_EDIT_TOOL_E2E        PASS
CLOUD_LOCAL_SHELL_TOOL_E2E       PASS
CLOUD_FUNCTION_CALL_OUTPUT       PASS
CLOUD_SAME_SESSION               PASS
CLOUD_USAGE_SETTLEMENT           PASS
```

Additional gates:

```text
ACCOUNT_SUBSCRIPTION_USAGE       PASS
CLIENT_CONFIG                    PASS
LATEST_RELEASE                   PASS
REFRESH_TOKEN_ROTATION           PASS
LOGOUT_AFTER_ROTATION            PASS
TOKEN_EXPIRED_SAFE_RETRY         PASS
DEVICE_REVOKED_STATE             PASS
SUBSCRIPTION_EXPIRED_STATE       PASS
QUOTA_EXCEEDED_STATE             PASS
SERVER_UNREACHABLE_STATE         PASS
RESPONSES_TIMEOUT                PASS
RESPONSES_DISCONNECT             PASS
LOCAL_PROVIDER_PRESERVED         PASS
```

## Evidence

- Mock Server: `http://127.0.0.1:3001`
- Entitled model: `mock/mock-chat`
- Account: Pro / ACTIVE
- Stable random device UUID survived store recreation and machine restart.
- Usage changed from 7 to 13 requests and 251 to 492 tokens.
- SSE included created, text delta, output item completion, response
  completion, and terminal `[DONE]`.
- The tool prompt did not contain `CLOUD-TOOL-731`.
- Cloud emitted sequential `read_file`, `edit_file`, and `run_shell` calls.
- Local read output contained `CLOUD-TOOL-731`.
- Local edit persisted `CLOUD-EDIT-482` to disk.
- Local shell returned `CLOUD-SHELL-913`.
- Final same-thread Cloud answer contained all three outputs, including
  `CLOUD-TOOL-731`.

## Implementation map

Desktop Cloud:

- `copilot-bridge-app/electron/cloud/contract.ts`
- `copilot-bridge-app/electron/cloud/http-cloud-client.ts`
- `copilot-bridge-app/electron/cloud/cloud-foundation.ts`
- `copilot-bridge-app/electron/cloud/remote-bridge-server.ts`
- `copilot-bridge-app/electron/cloud/token-store.ts`
- `copilot-bridge-app/electron/cloud/windows-credential-manager.ts`
- `copilot-bridge-app/electron/cloud/device-identity.ts`

Desktop integration:

- `copilot-bridge-app/electron/bridge-manager.ts`
- `copilot-bridge-app/electron/main.ts`
- `copilot-bridge-app/electron/preload.cts`
- `copilot-bridge-app/src/components/CloudAccountSheet.tsx`
- `copilot-bridge-app/src/App.tsx`

Acceptance:

- `copilot-bridge-app/scripts/cloud-e2e-harness.mjs`
- `copilot-bridge-app/test/cloud-foundation.test.mjs`

## Configuration

The Desktop Cloud base URL is not a production constant. Set:

```text
COPILOT_BRIDGE_CLOUD_BASE_URL
```

The E2E harness additionally reads the test account and password from:

```text
COPILOT_BRIDGE_E2E_EMAIL
COPILOT_BRIDGE_E2E_PASSWORD
```

No password or token is stored in source or `settings.json`.

## Validation commands

From `copilot-bridge-app`:

```powershell
npm run typecheck
npm test
npm run test:cloud-e2e
```

The Cloud E2E requires the authoritative Mock Server on
`127.0.0.1:3001` and the three environment variables above.

Latest results:

```text
Desktop build/typecheck          PASS
Desktop unit/regression tests    11/11 PASS
Desktop Cloud E2E                PASS (23/23 gates)
Server contract tests            3/3 PASS
Server API tests                 12/12 PASS
Server contract/API typecheck    PASS
Generated OpenAPI validation     PASS
```

## Preserved boundaries

- Existing Responses Tool Bridge core was not modified.
- FILE-0 local workflow architecture was not expanded.
- Original/Bridge Profile behavior was not changed for Cloud.
- PNG Vision was not changed.
- Local Copilot remains available for development, diagnostics, and fallback.

## Next

1. Run installed Electron UI acceptance in Cloud mode against a release-gated
   production-like TLS Gateway.
2. Confirm ChatGPT Desktop end-user interaction through the localhost Remote
   Bridge without changing the validated protocol path.
3. Configure the account-management action when the product contract supplies
   its URL.

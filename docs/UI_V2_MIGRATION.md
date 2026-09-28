# Desktop UI/UX V2 Migration

## 1. Current implementation analysis

- Electron main owns ProfileStore, Local/Remote Bridge lifecycle, Cloud auth,
  Credential Manager, stable device identity, ChatGPT package integration,
  startup, tray, and single-instance behavior.
- React receives typed IPC state and contains no direct Server HTTP calls.
- `backendMode` remains the internal compatibility mapping for the two
  implemented providers.
- Cloud account, subscription, usage, devices, and models come from Contract
  `1.0.0`. Local models come from the Copilot SDK.
- Profile selection and AI provider selection are independent dimensions.

## 2. V2 gaps found

- Account information occupied too much of the home page.
- Provider identity and model identity were represented mostly as backend
  mode plus model ID rather than explicit product-domain objects.
- Provider switching lacked an explicit from/to confirmation.
- GitHub Device Flow exposed only coarse login states.
- The Server contract has no remaining-points, referral, installation ID,
  device credential, Custom API, Local Model, or new V2 business-error
  schemas.
- Current persistent `CODEX_HOME` cannot guarantee that ChatGPT automatically
  reverts to Original merely because the Copilot Bridge process is not
  running. Applying the on/off target still requires Windows sign-out/in or
  restart.

## 3. Modified modules

- `src/App.tsx`: product flow orchestration and confirmations.
- `src/components/BridgeActivationBar.tsx`: independent ChatGPT Bridge switch.
- `src/components/AccountSummaryCard.tsx`: compact account status line.
- `src/components/CurrentServiceCard.tsx`: current provider/model/reasoning.
- `src/components/ServiceSelectionSheet.tsx`: provider catalog.
- `src/components/CloudAccountSheet.tsx`: account, points, devices, and
  unavailable Contract features.
- `electron/cloud/cloud-foundation.ts`: structured account/device/usage view.
- `electron/copilot-auth.ts`: detailed Device Flow state.
- `electron/cloud/device-identity.ts`: installation ID migration.

## 4. New modules

- `src/domain/product-models.ts`: `AIProvider`, `ProviderConnection`,
  `AIModel`, `UserAccount`, `SubscriptionSummary`, `PointsBalance`, `Device`,
  `UsageSummary`, and `ReferralSummary`.
- `electron/cloud/product-account-api.ts`: replaceable production and Mock
  account APIs.

## 5. Data-model changes

- A separate random `installationId` is persisted beside the existing
  contract-compatible `deviceId`.
- Cloud UI state exposes Server devices and used credit as used AI points.
- `remainingPoints` is explicitly nullable and never calculated by Desktop.
- Custom API and Local Model providers exist as unavailable catalog entries
  until adapters/contracts arrive.

## 6. API dependencies

Existing Contract support:

- account, plan, subscription, period;
- used credit, requests, token metering;
- device list/status;
- entitled Cloud models.

Open Contract issues:

- remaining points and per-response point settlement;
- referral summary/history and invite validation;
- installation ID/device credential;
- provider configuration catalog;
- V2 business error codes.

See `docs/protocol/CONTRACT_ISSUES.md`.

## 7. UI changes

- Home priority: Bridge activation, compact account state, AI service/model,
  ChatGPT action, and low-emphasis diagnostics.
- Bridge activation is distinct from provider selection.
- AI service selector includes Cloud, GitHub Copilot, Custom API, and Local
  Model; unsupported providers are visible but disabled.
- Provider changes require a from/to confirmation.
- GitHub Copilot selection uses subscription preflight and detailed Device
  Flow steps.
- Account detail owns points, devices, subscription actions, and explicit
  unavailable referral/history states.

## 8. Migration plan

1. Existing settings and provider mode remain compatible.
2. Existing `cloud-device.json` receives an installation ID atomically on
   first V2 read.
3. Existing Cloud/Local modes map to the new provider IDs without changing
   network protocols.
4. Custom API and Local Model remain unavailable until their contracts and
   adapters are approved.
5. When Server adds points/referral/device-credential fields, replace the
   `ProductAccountApi` adapter; do not rewrite UI components.
6. Real ChatGPT Desktop activation remains blocked pending safe Windows
   sign-out/in or restart.

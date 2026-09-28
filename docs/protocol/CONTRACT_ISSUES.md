# Cloud Contract Issues

## CONTRACT_CONFLICT-001: V2 contract is not represented by generated OpenAPI

**Status: RESOLVED by Contract `2.1.0` on 2026-09-24.**

- `api-v2.md`, `v2-schemas.ts`, `openapi.v2.json`,
  `CONTRACT_VERSION.json`, and the Production Manifest all report `2.1.0`.
- Generated OpenAPI SHA256
  `e7f84c5fb8811f4ede1aee4964a37ace8682cc3ae720ade0b5941362aff6b1c6`
  matches the Manifest.
- Desktop retains the separately frozen Gateway V1 compatibility boundary.

## CONTRACT_CONFLICT-002: Desktop registration cannot reach referral binding

**Status: RESOLVED by Contract `2.1.0` on 2026-09-24.**

- Registration returns only `{user}`.
- Desktop bearer authentication requires device login.
- Device login requires an active subscription.
- Referral apply requires authenticated actor state and must occur before a
  subscription exists.

Registration now accepts optional `referralCode`. Validation, account
creation, referral binding, and the audit row commit atomically on Server.
Desktop forwards the optional code without validating or awarding it.

## CONTRACT_CONFLICT-003: Production V2 billing and real provider are disabled

**Status: RESOLVED FOR SHADOW by Contract `2.1.0` on 2026-09-24.**

The Production Manifest now states:

```text
Billing mode: SHADOW
Real provider: BLOCKED
Available model: mock/mock-chat
```

Therefore production cannot currently prove the required real chain:

```text
AI request -> provider metering -> rating -> point debit -> remaining balance
```

The final installed App verified `pointsRated=1`, `pointsCharged=0`,
`billingStatus=SHADOW`, and wallet `10000 -> 10000`, then queried the same
settlement by Response ID. `ENFORCED` and real-provider E2E remain blocked and
were not enabled.

## CONTRACT_ISSUE-001: Release endpoint has no machine contract

**Status: RESOLVED by Server Contract update on 2026-09-23.**

- Endpoint: `GET /api/v1/releases/latest`
- Current schema: Mentioned in `GATEWAY_API_V1.md` and implemented by the
  Server, but absent from `openapi.v1.json` and
  `packages/contract/src/schemas.ts`.
- Expected schema: A frozen Zod response schema and generated OpenAPI path for
  the latest release response, including the nullable case.
- Reason: Desktop cannot implement `getLatestRelease()` without guessing
  fields from a database implementation that is not part of the public wire
  contract.
- Client action: Keep `getLatestRelease()` explicitly unavailable until the
  Server contract is generated.

## CONTRACT_ISSUE-002: Mock cannot drive all required error states

**Status: RESOLVED by loopback-only Mock controls on 2026-09-23.**

- Endpoint: Mock control surface for authenticated API and `/v1/responses`
- Current schema: The frozen error enum includes `SUBSCRIPTION_EXPIRED` and
  `MONTHLY_QUOTA_EXCEEDED`, but the public Mock contract exposes no endpoint,
  header, account, or deterministic input that changes the fixed active
  subscription or usage limit.
- Expected schema: A test-only, loopback-only control contract or additional
  documented test accounts that deterministically produce each required
  error without relying on implementation details.
- Reason: Desktop must validate real `error.code` state transitions and must
  not invent undocumented trigger headers or mutate Server internals.
- Client action: Validate reachable errors (`TOKEN_EXPIRED`,
  `DEVICE_REVOKED`, `SERVER_UNREACHABLE`) against the real Mock Server and
  retain unit coverage for the remaining stable error mappings until the Mock
  contract is extended.

## CONTRACT_ISSUE-003: Quota state name differs from wire error code

**Status: RESOLVED and explicitly documented on 2026-09-23.**

- Endpoint: All authenticated endpoints
- Current schema: Desktop state is `QUOTA_EXCEEDED`; frozen wire error is
  `MONTHLY_QUOTA_EXCEEDED`.
- Expected schema: The distinction is documented as an intentional mapping.
- Reason: Exact error-code matching is required; mapping
  `MONTHLY_QUOTA_EXCEEDED` to the UI state `QUOTA_EXCEEDED` must not depend on
  English error text.
- Client action: Map the frozen wire code explicitly and retain the existing
  UI state name.

## CONTRACT_ISSUE-004: Mock final response does not verify tool output

**Status: RESOLVED by Mock output consumption on 2026-09-23.**

- Endpoint: `POST /v1/responses`
- Current schema: Function calls and same-thread continuation are supported,
  but after tool outputs the Mock returns only
  `Completed N local tool result(s).`
- Expected schema: The documented Mock tool scenario must include the received
  tool output in the final answer, or expose a deterministic assertion result.
  For the marker-hidden acceptance fixture, the final response must contain
  `CLOUD-TOOL-731`.
- Reason: Counting `function_call_output` items proves continuation but cannot
  prove that the Server/MockProvider consumed the actual local read result.
- Client action: Run the real read/edit/shell sequence, verify local effects,
  record the exact outputs sent back to Cloud, and keep the final-marker gate
  blocked until the MockProvider contract is corrected.

## CONTRACT_ISSUE-005: Points balance and per-request settlement are absent

**Status: RESOLVED IN CONTRACT 2.1.0 FOR SHADOW.**

- Endpoint: `GET /api/v1/account`, `GET /api/v1/usage/current`, and
  `POST /v1/responses`
- Current schema: Usage exposes `credit`, `creditLimit`, token counts,
  requests, and percent. Response settlement exposes only token usage.
- Expected schema: Server-authoritative `points_used`, `remaining_points`, and
  per-response `usage.points` / `usage.remaining_points`.
- Reason: Desktop must not calculate the remaining balance or translate
  tokens/credit into user-facing points.
- Client action: Integrated `/me/wallet`, wallet transactions, V2 usage,
  response billing fields, and settlement lookup. Installed Production E2E
  passed Shadow rating without wallet debit.

## CONTRACT_ISSUE-006: Referral and reward APIs are absent

**Status: RESOLVED IN CONTRACT 2.1.0.**

- Endpoint: Account referral summary, referral history, and optional invite
  code validation during registration/login.
- Current schema: No referral code, invite count, reward balance, history, or
  validation endpoint exists in Zod/OpenAPI.
- Expected schema: Server-generated referral summary and paginated history.
- Reason: Referral codes and rewards must never be generated or validated by
  Desktop.
- Client action: Referral code, stats, history, apply, and registration-time
  optional referral forwarding are integrated. Server remains authoritative
  for validation, binding, qualification, and rewards.

## CONTRACT_ISSUE-007: Installation identity and device credential are absent

**Status: RESOLVED BY CONTRACT SEMANTICS.**

- Endpoint: Login and device registration.
- Current schema: `DeviceInfo` contains one random `deviceId` plus name and
  platform metadata. It has no `installationId` or device credential.
- Expected schema: A stable installation ID, Server device ID, and
  revocable device credential/token with an explicit storage lifecycle.
- Reason: The V2 device model distinguishes an installation from the Server
  device record.
- Client action: V2 explicitly defines `deviceId` as the stable installation
  UUID and login returns the device credential. No duplicate installation ID
  is retained.

## CONTRACT_ISSUE-008: Provider configuration catalog is absent

**Status: RESOLVED FOR MANAGED AND DEEPSEEK BYOS.**

- Endpoint: Provider list/configuration and provider-specific model catalog.
- Current schema: The Server catalog exposes entitled Cloud models only.
  Desktop has the existing Local Copilot SDK provider. There is no Contract
  for Custom API or Local Model configuration.
- Expected schema: Provider identity, connection state, configuration schema,
  availability, and model ownership/capabilities.
- Reason: Desktop must not infer endpoints, key formats, or provider
  availability.
- Client action: Managed provider catalog/models and DeepSeek BYOS
  connections are integrated. Local Model remains unavailable because
  `api-v2.md` explicitly marks local usage reporting as `PENDING`.

## CONTRACT_ISSUE-009: V2 business error codes are absent

**Status: RESOLVED IN CONTRACT 2.1.0.**

- Endpoint: All authenticated/account/provider endpoints.
- Current schema: Does not define `AUTH_REQUIRED`, `INSUFFICIENT_POINTS`,
  `PROVIDER_AUTH_REQUIRED`, or `COPILOT_NOT_ENTITLED`.
- Expected schema: Frozen codes and HTTP mappings with deterministic Mock
  controls or test accounts.
- Reason: Desktop business state must be driven by `error.code`, never message
  parsing.
- Client action: Codes are parsed and mapped centrally. Production E2E for
  point/provider-specific errors remains blocked by disabled billing and
  missing real provider.

# Architecture Decisions

## ADR-001: Reuse copilot-sdk-proxy

**Decision:** Use pinned `copilot-sdk-proxy` as the Responses API core.

**Reason:** Avoid maintaining a replacement Responses/SSE implementation.

## ADR-002: External Codex executes tools

**Decision:** Copilot declares and requests tools; Codex executes them.

**Reason:** Prevent Agent-on-Agent shell and filesystem execution conflicts.

## ADR-003: Isolate Original and Bridge

**Decision:** Use separate local environments rather than repeatedly changing
one shared provider configuration.

**Reason:** Protect sessions, workspace state, cache, SQLite, and auth.

## ADR-004: Never log out Original

**Decision:** Do not invoke `codex logout` or alter Original auth.

**Reason:** Provider switching must not destroy the user's identity.

## ADR-005: Copy-only import

**Decision:** Imports never move or delete Original data.

**Reason:** Original data remains user-owned and recoverable.

## ADR-006: Desktop runtime is authoritative

**Decision:** Treat ChatGPT Desktop bundled Codex 0.155.0-alpha.9.2 as the
product runtime, not npm CLI 0.142.3.

**Reason:** Desktop bundled app-server owns the runtime schema and model cache
used by the target application.

## ADR-007: Functional-first physical Codex Home swap

**Decision:** The first release switches profiles only while ChatGPT Desktop
is closed by moving whole Codex Home directories between the active location
and Bridge-managed profile locations. Moves must be same-volume directory
renames, guarded by a persisted transaction journal and recovery routine.
Profile contents, including authentication and SQLite files, are never
deleted.

**Reason:** The Desktop shell has no proven supported way to inherit an
injected `CODEX_HOME`. A closed-Desktop physical swap delivers the required
profile isolation without depending on that unresolved integration.

**Consequences:** The implementation must reject missing or unsafe inputs,
roll back move failures, recover interrupted transactions deterministically,
and be validated against disposable data before any real profile is touched.
Direct Desktop `CODEX_HOME` injection remains non-blocking research.

**Status:** BLOCKED BY VALIDATION. The Fake PoC passed, but normal-user and
administrator attempts to rename the real Original Home both returned
`EPERM`, including while the Codex sandbox service was stopped. A different
safe implementation backend is required before this decision can be used in
production.

## ADR-008: Persistent user-level environment profile backend

**Decision:** Select the Bridge profile by setting the persistent user-level
`CODEX_HOME` to the Bridge Home. Select Original by restoring the previously
recorded value, or clearing the value when it was absent. Each switch persists
the intended profile and a restart-required state before asking the user to
restart or re-login; the product validates the effective profile after startup.

**Reason:** A real Store Desktop launch after restart populated the isolated
Bridge Home. Clearing the variable and restarting made normal Desktop launch
write to Original Home. This is reversible and never moves or edits Original
as part of the switch.

**Consequences:** Profile switching is not immediate. The implementation must
retain the prior value, provide interrupted-switch recovery, avoid exposing
the compatibility model in the UI, and distinguish normal Original runtime
writes from Bridge-initiated mutations.

## ADR-009: Application-managed GitHub Copilot device-code authentication

**Decision:** CopilotBridge owns the user authentication UX. It invokes the
official Copilot runtime's device-code OAuth flow, displays the verification
URL and device code, opens the default browser, and reports success, expiry,
or cancellation in the application. It never asks the user to run PowerShell
or provide an access token.

**Reason:** A global Copilot CLI may use a different runtime-specific
credential-store identity than the SDK-bundled runtime. The local validation
required explicitly selecting the authenticated official runtime; therefore,
global CLI installation and state are not a reliable product dependency.

**Consequences:** The packaged application must ship and pin its official
runtime, use that same runtime for login and SDK sessions, store no copied
OAuth token itself, and offer reconnect/logout through the application UI.

## ADR-010: Bridge Profile uses permanent unrestricted Desktop permissions

**Decision:** Configure Bridge Profile with
`sandbox_mode = "danger-full-access"` and
`approval_policy = "on-request"`. Remove per-directory writable-root
restrictions.

**Reason:** The user explicitly chose unrestricted host access for the Bridge
Agent. A real Desktop Agent task then accessed the `E:` sample project,
applied a patch, and completed its test run.

**Consequences:** While Bridge Profile is active, Agent tools can access files
and execute commands with the current user's host permissions. The future UI
must prominently disclose this profile setting before activation and provide a
restricted alternative. Original Profile remains isolated and unmodified.

## ADR-011: Defer copy-only import from the first release

**Decision:** Do not include Phase 0H local session import in the first
release.

**Reason:** The validated profile backend already preserves isolated session
stores. Importing local Desktop data requires ongoing runtime-schema safety
validation and is not necessary for the core switch-and-restore workflow.

**Consequences:** The first release exposes no import control. A later import
feature must be opt-in, copy-only, schema-aware, and separately accepted.

## ADR-012: Copilot Bridge owns ChatGPT bootstrap experience

**Decision:** The first-release product detects current Windows ChatGPT Desktop
package registration and offers only official-source installation through
Windows Package Manager or Microsoft Store fallback.

**Reason:** A normal user should not need to independently discover, install,
or configure ChatGPT before connecting Copilot Bridge.

**Consequences:** The app must expose `NOT_INSTALLED` without faking Profile
state, detect post-install availability, and never download or host unknown
ChatGPT installers.

## ADR-013: Preserve Original UNINITIALIZED and CUSTOM states

**Decision:** Original Profile is not always an unset `CODEX_HOME`. It can be
`UNINITIALIZED`, `READY`, or `CUSTOM`.

**Reason:** New ChatGPT users may have no Original Home; established users may
have a custom `CODEX_HOME` that must be restored exactly.

**Consequences:** The profile transaction must record/restore the actual prior
value and UI must not offer “恢复原账号” when Original is uninitialized.

## ADR-014: Prepare Local and Remote backend modes

**Decision:** Introduce `BackendMode` with `LOCAL` as the current mode and
`REMOTE` as a reserved future mode. ChatGPT Desktop continues to access only
the local client Bridge.

**Reason:** Remote Gateway development must not require ChatGPT Desktop to
store public Gateway credentials or change its tool-execution boundary.

**Consequences:** Future remote client Bridge forwards model traffic over
authenticated HTTPS while local Codex remains the filesystem/shell executor.

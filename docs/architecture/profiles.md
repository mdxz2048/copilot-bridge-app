# Environment Profiles

## Original

Original is the existing `%USERPROFILE%\.codex` environment plus Desktop user
state. It is read for non-sensitive metadata only during discovery. It must
never be deleted, logged out, moved, or overwritten.

## Bridge

Bridge is a durable local environment rooted at
`%LOCALAPPDATA%\CopilotBridge\profiles\bridge\codex-home`. It begins empty,
never imports Original auth, and retains Bridge-only sessions and state.

## Switching

Switching must be transactional: prepare, stop Desktop after user action,
backup, activate, validate, start, verify, and commit. Failure rolls back.

## Current evidence

Desktop bundled app-server honors `CODEX_HOME` and creates isolated SQLite and
state in a fresh Bridge Home. Store Desktop shell adoption of that Home remains
unproven; no junction or migration may be attempted yet.

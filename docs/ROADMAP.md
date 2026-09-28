# Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 0A | Responses API and generic Tool Bridge | BASIC PASS |
| 0B | ChatGPT Desktop runtime discovery | PASS |
| 0C | Persistent user `CODEX_HOME` profile switching with restart | PASS |
| 0D | Desktop Responses E2E | PASS |
| 0E | Desktop Agent Tool E2E | PASS |
| 0F | Session Isolation E2E | PASS |
| 0G | Workspace Isolation E2E | PASS |
| 0H | Optional copy-only import | PENDING |
| 1 | Desktop application skeleton | PENDING |
| 2 | Main UI | PENDING |
| 3 | Switch, restore, backup | PENDING |
| 4 | Tray, startup, recovery | PENDING |
| 5 | Packaging | PENDING |
| 6 | Release acceptance | PENDING |

## Current acceptance target

The persistent user-level `CODEX_HOME` backend passed the real Desktop
activation test in both directions: setting it to Bridge Home and restarting
caused the Store Desktop runtime to create Bridge-only state; clearing it and
restarting caused normal Desktop launch to update Original Home. All eleven
checked SQLite databases passed read-only `PRAGMA quick_check`. The physical
directory swap remains a Fake PoC only because real Original rename returns
`EPERM`.

Before the UI can be accepted, Phase 1 must include application-managed GitHub
Copilot device-code authentication. The application displays the device code,
opens the browser verification URL, monitors completion, and never directs the
user to PowerShell or requests a token.

Phase 0C through 0G real E2E gates are complete. The remaining Phase 0
product-readiness work is to implement, rather than manually orchestrate, the
application-owned device-code OAuth, runtime packaging/selection, persistent
profile switch transaction, restart UX, recovery, and permission disclosure.
Phase 0H is explicitly deferred from the first release.

The release channel for the first MVP is an NSIS per-user installer, not the
single-file portable EXE. Portable builds remain a development diagnostic
artifact because their self-extraction delays startup.

The portable application now has an implemented BridgeManager, real health and
model IPC, model/reasoning persistence, device-login UI, and environment
switch dialogs. Its remaining product gate is full portable user-flow E2E,
including a fresh isolated device login and app-driven profile switching.

## Product Continuation Phases

| Phase | Scope | Status |
| --- | --- | --- |
| A | ChatGPT detection and official install | IN PROGRESS |
| B | Fresh install and zero-login bootstrap | PENDING |
| C | Startup, tray, and Bridge auto start | PENDING |
| D | UI content-flow refinement | PASS (V2) |
| E | Complete installed local E2E | BLOCKED BY SYSTEM RESTART |
| F | Remote Gateway localhost PoC | PASS (Mock and production TLS E2E) |
| G | Remote device pairing and auth | PENDING |
| H | Remote two-device E2E | PENDING |
| I | TLS deployment and Gateway productization | PENDING |
| ATT-1 | Desktop image input wire probe | BLOCKED BY SYSTEM RESTART |
| ATT-2 | Attachment compatibility layer | PARTIAL (resolver/wiring pass; packaged TXT consumption blocked) |
| ATT-3 | Attachment-aware session send | PASS (provider forwarding covered) |
| ATT-4 | Desktop PNG/TXT attachment E2E | BLOCKED BY SYSTEM RESTART |
| ATT-5 | Large document local tool fallback | PARTIAL (long text workflow PASS; rich document formats pending) |
| ATT-6 | Local artifact output probe | PARTIAL (TXT/CSV/XLSX filesystem PASS; Desktop artifact UI blocked) |
| ATT-7 | Remote temporary asset relay | PENDING |

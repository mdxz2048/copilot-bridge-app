# DEVELOPMENT HANDOFF: Production Integration Gate

```text
DESKTOP BUILD:
PASS

NSIS INSTALL:
PASS

PRODUCTION LOGIN:
PASS

PRODUCTION DEVICE:
PASS

PRODUCTION SUBSCRIPTION:
PASS

PRODUCTION USAGE:
PASS

PRODUCTION MODELS:
PASS

PRODUCTION TEXT:
PASS

PRODUCTION SSE:
PASS

INSTALLED CHATGPT DESKTOP:
BLOCKED

CLOUD LOCAL READ:
BLOCKED

CLOUD LOCAL EDIT:
BLOCKED

CLOUD LOCAL SHELL:
BLOCKED

CLOUD SAME SESSION:
BLOCKED

USAGE SETTLEMENT:
PASS

ACCOUNT UI:
PASS

STARTUP/TRAY:
PASS

LOCAL MODE REGRESSION:
PASS

CURRENT BLOCKERS:
Persistent user-level CODEX_HOME points to Bridge Home, but the current
Windows session and ChatGPT Desktop have not inherited it. Effective
activation requires sign-out/sign-in or Windows restart. The user selected
not to perform that activation in this round. BLOCKER-003 remains open for
Windows restart safety.

CROSS_AGENT ACTION REQUIRED:
None for the validated Contract 1.0.0 integration. Server must notify Desktop
before changing CONTRACT_VERSION or OpenAPI hash. A future real-provider gate
is still required because the production Manifest explicitly identifies the
available production integration model as account-gated mock/mock-chat.
```

## Frozen identities

```text
Desktop HEAD:
7d11d19e9e5a169d05b6621950c5ae5609a56870

Desktop worktree:
CLEAN

Final production source fingerprint:
365340c27e68dd0320dc383ec44ebb81eca641b8ed45ac83d324c03847062524

Contract version:
1.0.0

Server commit:
534cb791f2dc412722b1b14bc719d3e615a160eb

OpenAPI SHA256:
4c72178606ecd71ec047c9618e89eff6581e489f53d80ff54f4035d7152a2d85

Manifest SHA256:
8b8353ee80be272e10b5290d9610847bcabc31e390e255f3c769071adba9e813

Installer SHA256:
779229243a2bf5a9faf1f5291085f727cd25d03af489c37a76ea2cf648cefd90

Installed EXE SHA256:
2b15ff722d465a3a51a85a1eb24d632f299b9634bf1a507752c83856872f9904
```

## Production evidence

- TLS health returned HTTP 200.
- Production account login and active device registration passed.
- Account returned Pro/ACTIVE with real usage.
- Server model catalog returned only `mock/mock-chat`.
- JSON and SSE Responses passed.
- Production Remote Bridge read/edit/shell sequence returned
  `CLOUD-TOOL-731`, `CLOUD-EDIT-482`, and `CLOUD-SHELL-913`.
- Production harness did not use `X-Mock-Error-Code`.
- Usage increased from 22 to 28 requests and 603 to 844 tokens in the final
  full production harness run.
- Installed application renderer/main IPC passed login, account, subscription,
  usage, models, text, SSE, refresh, management action, and Bridge restart.
- Startup entry, background autostart, single instance, native close-to-tray,
  reopen, and Remote Bridge persistence passed.
- LOCAL returned the Copilot SDK catalog; REMOTE returned only the Server
  catalog.

## Important interpretation

The production endpoint and installer loop are accepted, but the Manifest
states that the entitled production test model is `mock/mock-chat`.
Real-provider and payment release candidacy are not implied.

Protocol-level production local tools passed through the installed localhost
Remote Bridge. The handoff marks the four `CLOUD LOCAL ...`/same-session rows
as BLOCKED because the required final consumer was real ChatGPT Desktop, and
that application was not switched from Original Home.

## Next executable step

After explicit user approval:

1. Sign out/in to Windows, or restart only after `BLOCKER-003` is resolved.
2. Confirm effective `CODEX_HOME` is Bridge Home.
3. Run real ChatGPT Desktop chat, local read, edit, shell, sequential tools,
   same-session continuation, and usage settlement against production TLS.

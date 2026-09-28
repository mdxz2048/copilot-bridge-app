# Current Blockers

## BLOCKER-001

### Title

Direct in-process ChatGPT Desktop `CODEX_HOME` injection has not been proven.

### Status

NON-BLOCKING RESEARCH

### Impact

Does not block the first-release persistent user-environment backend. It may
inform a future no-restart/no-re-login integration.

### Evidence

- Desktop runtime and bundled app-server were identified.
- `DesktopLaunchProbe.exe` was run in normal user context.
- Direct Store-package `ChatGPT.exe` launch failed with WindowsApps access
  denied before a child process was created.
- The bundled app-server returned an injected Bridge `codexHome` and wrote
  SQLite/state only into that Bridge Home.
- Original top-level metadata remained unchanged during all probes.

### Next experiment

Identify a supported Store Desktop shell-to-app-server/profile connection
mechanism. The current app-server schema contains `codexHome` in initialize
responses but no confirmed desktop launch/home override.

### Fallback A findings

- The Desktop bundled `app-server daemon version` control path could not
  connect to `%USERPROFILE%\.codex\app-server-control\app-server-control.sock`;
  no managed daemon was available for attachment.
- The generated Desktop app-server schema confirms `codexHome` in
  initialization, but does not expose a confirmed profile, home, state-root,
  or SQLite-root launch override for the Store Desktop shell.
- The bundled `app-server proxy` command only connects to an existing control
  socket and cannot create or configure a Desktop shell connection. No
  relevant runtime reference was found in the unpacked Desktop resources.

### Resolution criteria

ChatGPT Desktop creates and retains its sessions, SQLite state, cache, and
workspace state in Bridge Home while Original remains unchanged, then restores
Original successfully.

### Persistent environment result

The relevant restart-based mechanism is proven: setting user-level
`CODEX_HOME` to Bridge Home, restarting Windows, and launching the registered
Store app populated Bridge state without writes to Original. Clearing the
variable, restarting, and launching normally wrote to Original. This blocker
only covers an unsupported no-restart injection path.

## BLOCKER-002

### Title

Safe physical real-directory swap validation has not been performed.

### Status

BLOCKED BY VALIDATION; NOT A RELEASE BACKEND

### Impact

Does not block Phase 0C. It prevents use of physical directory rename in the
product.

### Constraints

- ChatGPT Desktop must be fully closed.
- The validation target must be a disposable copy, never
  `%USERPROFILE%\.codex`.
- The validation must not run `codex logout`, alter original authentication,
  or delete any profile content.
- All active, profile, staging, and state directories must reside on the same
  NTFS volume.

### Resolution criteria

Perform the journaled swap and recovery validation on disposable copied
directories, verify preservation of file hashes and separate SQLite files,
then restore the initial active directory successfully.

### Current evidence

The fake-directory PoC passed 16 deterministic checks on 2026-09-21,
including separate SQLite `quick_check` results and crash recovery for each
journal stage. This evidence does not exercise or authorize any real Codex
Home directory.

### Authorized real-PoC attempt

An authorized Original-to-Bridge attempt was made only after ChatGPT and
`codex.exe` process checks returned zero processes. The first same-volume
rename of `%USERPROFILE%\.codex` returned `EPERM` in the Agent execution
context. Automatic recovery completed: Original entry count, directory
timestamp, and `config.toml` SHA-256 remained at their preflight values; no
Original profile storage directory or journal remained, and active profile
stayed `original`.

The current user ACL reports FullControl, so the failure may be caused by the
Agent's restricted execution context. A normal-user invocation of the same
tested backend is required before concluding that physical switching fails.

### Root-cause investigation

The same `EPERM` occurred from the normal-user runner. Parent and `.codex`
ACLs both grant the user FullControl. The remaining related process is the
automatic LocalSystem service `CodexSandboxService.OpenAI.Codex`
(`codex-windows-sandbox-service.exe`), which remains running after ChatGPT
and `codex.exe` close. A controlled service-stop validation requires Windows
administrator authorization.

### Administrator validation result

The administrator runner stopped the service successfully, invoked the same
journaled backend, and restored the service in its `finally` block. The
rename still returned `EPERM`. Recovery again removed the journal, left
active state as `original`, and preserved the Original entry count, timestamp,
and `config.toml` SHA-256.

Physical directory rename is therefore currently not a viable real-profile
backend for this installation. No further move-API retries may be attempted
against Original until a non-destructive root cause or a different safe
backend is identified.

### Post-reboot confirmation

After a Windows restart, with no ChatGPT or `codex.exe` foreground process,
the administrator runner again stopped the sandbox service, attempted the
same rename, and restored the service. It again failed. Original entry count,
timestamp, and `config.toml` SHA-256 remained unchanged; active state stayed
`original` and no journal remained. Reboot does not resolve this backend
limitation.

## BLOCKER-003

### Title

Windows kernel crashes during system restart.

### Status

OPEN; BLOCKS RESTART-DEPENDENT E2E

### Evidence

- Recent BugCheck events include `0x139 KERNEL_SECURITY_CHECK_FAILURE` with
  parameter 1 equal to 3, and `0x109 CRITICAL_STRUCTURE_CORRUPTION`.
- `0x139` occurred before the current installer and the latest application
  restart work.
- `MEMORY.DMP` exists, but dump and WER report contents require administrator
  access for faulting driver/module attribution.

### Product mitigation

The application source currently does not invoke `shutdown.exe`. It tells the
user to manually restart only after the system issue is resolved.

This currently blocks only restart-dependent validation, including Bridge
profile re-entry, ATT-1 Desktop image-input wire capture, and ATT-4 Desktop
PNG/TXT attachment E2E. Proxy/SDK attachment implementation and packaged
Bridge smoke validation continue without a restart.

### Resolution criteria

Obtain authorized dump attribution, remediate the responsible
system/driver/hardware issue, and complete a normal manual restart without
BugCheck before resuming restart-dependent E2E.

## BLOCKER-004

### Title

Packaged Copilot runtime does not currently expose TXT path attachment content
to the model.

### Status

OPEN; BLOCKS NATIVE TEXT ATTACHMENT INPUT, MITIGATED FOR LOCAL MVP

### Evidence

- The resolver creates the SDK `file` attachment and provider-level forwarding
  test passes.
- A marker-hidden fresh direct SDK matrix invalidated the earlier TXT PASS:
  both the global and bundled official runtime fail TXT `file` and `blob`
  attachments, while both pass PNG `file` and `blob` attachments.
- The global and bundled `copilot.exe` are CLI 1.0.75 with identical SHA256,
  so packaging does not explain the differential.
- The packaged `win-unpacked` Bridge starts and serves `/health` successfully.
- A direct `/v1/responses` request containing the safe TXT fixture returns
  normal SSE, but the model reports that it cannot access the attached/tagged
  file content.
- A narrowly scoped `read_file` plus `read` permission experiment did not
  resolve the problem and was removed; no shell/write/all-tools permission was
  enabled.
- The marker-hidden Local MVP workflow harness passed TXT, Markdown, JSON,
  TypeScript, CSV, and 4,000-line pasted-text reads through declaration-only
  external tools and the existing Tool Bridge. It also passed TXT/CSV edits
  and creation plus XLSX read/modify/create through fixture-scoped
  Python/openpyxl execution.
- The harness used `allowedCliTools: []`, `autoApprovePermissions: false`,
  rejected paths outside its temporary fixture root, and removed all
  temporary files and proxy processes after completion.

### Product impact

The native SDK/runtime text-attachment route remains unsupported. The Local
MVP can nevertheless handle user-mentioned local text and spreadsheet files
when the Desktop/Codex client supplies its existing filesystem tools through
the Tool Bridge. This mitigation does not authorize arbitrary paths and does
not require a ResourceRegistry or a specialized spreadsheet tool.

### Resolution criteria

Obtain an official Copilot runtime/model version that passes the marker-hidden
TXT `file` or `blob` probe. Prove `attachment-sample.txt` returns `ALPHA-482`
through the native attachment route, then repeat PNG and Desktop ATT-1/4
acceptance. The Tool Bridge workflow is a product mitigation, not resolution
of the upstream native attachment limitation.

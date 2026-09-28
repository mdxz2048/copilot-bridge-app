# Phase 0 Acceptance Evidence

Date: 2026-09-21

## Upstream baseline

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Source revision | Fixed inspected upstream revision | `cdc56715f122b7b76f28bf74c1ee5b1beb77eff4` | PASS |
| License | Compatible OSS license | MIT | PASS |
| `npm run typecheck` | No diagnostics | Completed successfully | PASS |
| `npm run lint` | No diagnostics | Completed successfully | PASS |
| `npm run build` | TypeScript build succeeds | Completed successfully | PASS |
| `npm test` | All upstream tests pass | Test script omits the required development import condition | FAIL (upstream script) |
| Conditioned test run | All tests pass | 390/393 passed; 3 Windows path-separator assertions failed | FAIL (upstream Windows portability) |

## Official SDK verification

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Official CLI authentication | Authenticated SDK user | Official CLI OAuth completed; SDK reported authenticated `user` session | PASS |
| Model enumeration | Models available from SDK | 11 models returned, including `auto` and `gpt-5.6-terra` | PASS |
| Health | Local endpoint responds through SDK | `GET http://127.0.0.1:8787/health` returned HTTP 200 and protocol version 3 | PASS |
| Responses streaming | Streaming Responses API works | `POST /v1/responses` returned HTTP 200, `text/event-stream`, and `response.completed` | PASS |
| Reasoning/tool workflow | Agent can use a tool and continue | Tool-enabled request listed actual workspace entries and returned `response.completed` | PASS |
| Codex provider configuration | Current Codex can target the bridge | Codex CLI 0.142.3 completed a request through an isolated `model_provider` with `wire_api = "responses"` | PASS |
| Generic external function bridge | Function declarations are exposed to the SDK, call IDs route outputs back to the waiting session, and final text completes the resumed stream | 54 independently rerun bridge and Codex regression tests passed, including declaration mapping, sequential/correlated calls, timeout cleanup, disconnect cancellation, and session isolation | PASS |
| Codex Agent read-tool continuation | Codex executes an outer function tool and the model continues after its output | A real Codex `exec` read of `math.js` and `package.json` succeeded through the local bridge, and the model continued to the edit step | PASS |
| Codex Agent repair workflow | Analyze, edit, and test a sample project | Read operations reached Codex successfully; its unknown-model fallback enforced a read-only policy and rejected shell/edit tools. Rejections were delivered to the model as tool results, not HTTP failures; `math.js` remained unchanged | FAIL (client model metadata policy) |

## Codex catalog and sandbox investigation

| Check | Actual | Result |
| --- | --- | --- |
| Bundled catalog command | `codex debug models --bundled` | PASS |
| Bundled `gpt-5.6-terra` | Not present | PASS: backend model is not a CLI 0.142.3 compatibility model |
| Bundled `gpt-5.5` | Present | PASS: candidate compatibility model |
| Bundled `client_version` / `fetched_at` | Not supplied by the bundled command | Recorded |
| `models_cache.json` | Present; declares `client_version` `0.155.0`, `fetched_at` `2026-09-21T06:19:53.165871200Z`, and contains both models | Recorded; not valid metadata for installed CLI 0.142.3 |
| Cache compatibility | CLI 0.142.3 reported incompatible cache parse errors (`base_instructions` missing and trailing characters) | FAIL: cache belongs to a newer runtime/schema |
| Independent sandbox model | Bundled `gpt-5.5` | PASS |
| Effective sandbox | `workspace-write [workdir, /tmp, $TMPDIR]` | PASS |
| Effective approval policy | `never` | Recorded |
| Project trust | Non-Git temporary directory, run with `--skip-git-repo-check` | Recorded |
| Create / write / read | Create `sandbox_probe.txt`, write `first`, replace with `second`, read both values | PASS |
| Delete | `Remove-Item`, .NET deletion, and patch deletion all returned `Access denied` | FAIL: Windows sandbox ACL |

The sandbox experiment proves the earlier causal claim was incorrect:

**READ_ONLY ROOT CAUSE IS INDEPENDENT FROM MODEL FALLBACK.**

The fallback case itself reported an effective `workspace-write` sandbox. The
remaining file deletion failure is caused by the Windows sandbox token's ACL:
the affected identity has `RX,W` on the temporary file/directory, without
delete permission. No model metadata or Tool Bridge change was made.

## Compatibility adaptation validated in the local upstream experiment

1. Add an explicit `runtimeEntrypoint` option to `CopilotService` and connect
   through the SDK-supported `RuntimeConnection.forStdio` API.
2. Translate the legacy bare tool allowlist into
   `ToolSet().addBuiltIn(...)`.
3. Map outer Responses function declarations to SDK declaration-only custom
   tools. Route `external_tool.requested` calls to Responses
   `function_call` SSE items, then return correlated
   `function_call_output` values through the SDK pending-tool RPC without
   executing an OS handler.

These changes are not yet a product integration. They must be carried into a
locked, documented dependency patch if Phase 1 starts.

## Unmet hard gate

The generic tool loop is implemented and has a real read-tool continuation
check. The attempted write-enabled Codex repair run was still reported by the
client as `sandbox: read-only`, which blocked its edit and test commands.
ChatGPT Desktop Agent verification remains unrun. Therefore:

**PHASE 0: NOT ACCEPTED**

## Physical directory swap Fake PoC

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Original to Bridge | Whole fake active Home moves to Original storage and fake Bridge becomes active | Completed with journaled directory renames | PASS |
| Bridge to Original | Whole fake active Home restores to active path | Completed without deleting profile content | PASS |
| Repeated swaps | Twenty complete cycles preserve profile-specific state | 20 cycles passed | PASS |
| Crash recovery | Each persisted journal stage recovers deterministically | All five stages passed | PASS |
| Move failure rollback | Failed move restores a safe layout | Passed without profile loss | PASS |
| Invalid paths | Missing active/target paths are rejected before change | Passed | PASS |
| Lock/read-only errors | Errors do not delete profile content | Simulated Windows errors passed | PASS |
| Session isolation | Original and Bridge fake sessions remain separate | Passed | PASS |
| SQLite isolation | Separate profile databases remain valid | `PRAGMA quick_check` passed | PASS |

The self-contained Fake PoC has 16 passing checks and zero failures. It only
uses disposable directories on the workspace `E:` volume and is not
authorization to move the real Original Home.

## Authorized real physical swap attempt

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Preflight | ChatGPT and Codex processes stopped; paths same-volume | Zero relevant processes; all paths on `C:` | PASS |
| First Original rename | Move active Original Home to journal staging | `EPERM` in Agent context | FAIL |
| Automatic recovery | Preserve Original and restore `original` active state | Journal removed; no Original storage directory; active state `original` | PASS |
| Original integrity | Preserve baseline metadata | Entry count, last-write timestamp, and `config.toml` SHA-256 unchanged | PASS |

This does not establish that a normal Windows user cannot perform the rename:
the current user ACL reports FullControl, and the failure occurred in the
restricted Agent execution context. A normal-user backend probe is required.

## Administrator physical swap validation

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Sandbox service control | Stop and later restore the targeted service | Service stopped and restored successfully | PASS |
| Original rename with service stopped | Rename active Original Home to staging | `EPERM` | FAIL |
| Recovery | Restore safe Original layout | Journal removed; active state remained `original` | PASS |
| Original integrity | Preserve baseline metadata | Entry count, timestamp, and config SHA-256 unchanged | PASS |

The same rename failure now exists in Agent, normal-user, and administrator
contexts. The physical-directory backend remains valid only as a Fake PoC and
is not eligible to operate on Original data.

## Post-reboot administrator retry

| Check | Actual | Result |
| --- | --- | --- |
| Foreground processes | No ChatGPT or `codex.exe` after reboot | PASS |
| Sandbox service control | Successfully stopped and restored | PASS |
| Original rename | Failed again during same staging rename | FAIL |
| Recovery and integrity | Active state `original`; journal removed; Original baseline unchanged | PASS |

Reboot does not make physical Original Home rename available on this
installation.

## Persistent user-level `CODEX_HOME` profile switch

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Prior user variable | Preserve prior unset value | Recorded as unset before activation | PASS |
| Bridge activation | Set user `CODEX_HOME`, restart, launch normal Store Desktop | Bridge Home populated with plugins, skills, state, and five SQLite databases | PASS |
| Original preservation during Bridge activation | No Original mutation from Bridge launch | Entry count, timestamp, and `config.toml` SHA-256 retained the pre-activation baseline | PASS |
| Restore selection | Clear user `CODEX_HOME`, restart, launch normal Store Desktop | User variable remained empty and Original Home runtime timestamp/config updated | PASS |
| Bridge retention | Preserve Bridge Home after restoring Original | Bridge Home last-write timestamp remained at its activation value | PASS |
| Bridge SQLite integrity | Five databases are consistent | All `PRAGMA quick_check` results were `ok` | PASS |
| Original SQLite integrity | Six databases are consistent | All `PRAGMA quick_check` results were `ok` | PASS |

The variable was empty after the restoration restart and normal Store Desktop
launch wrote to default Original Home, establishing a functional reversible
switch. Original's entry count remained 75, while its timestamp and
`config.toml` hash changed during the normal Original launch. That is expected
runtime activity needed to prove the restore target; it is not evidence that
Bridge wrote to Original.

The resulting profile backend is persistent user-level `CODEX_HOME` plus a
required Windows restart or re-login. The physical directory swap remains a
Fake PoC only.

## Local authenticated Responses E2E

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| SDK authentication | Official runtime reports an authenticated user | Proxy startup authenticated successfully using the explicitly selected official runtime | PASS |
| Local binding | Bridge is reachable only through localhost | Listener started at `127.0.0.1:8787` | PASS |
| Health | SDK-backed health succeeds | HTTP 200, `status: ok`, protocol version 3 | PASS |
| Compatibility routing | Client `gpt-5.5` does not become the SDK backend model | Runtime log: `gpt-5.5` routed to `gpt-5.6-terra` | PASS |
| Copilot CLI tool isolation | No built-in CLI tools are available to Copilot | E2E config used `allowedCliTools: []`; request declared no tools | PASS |
| Responses stream | Real request returns valid SSE completion | HTTP 200 with expected lifecycle events and `response.completed` | PASS |

The test used only a minimal text request and did not invoke external tools.
It validates local Bridge authentication, model routing, and Responses
streaming. It does not replace the pending normal Store Desktop Responses E2E
or Agent Tool E2E.

## Real Store Desktop Responses E2E

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Bridge Profile activation | Store Desktop uses isolated Bridge Home after restart | User-level `CODEX_HOME` matched Bridge Home; Desktop updated its global-state files and Bridge Home timestamp | PASS |
| Required provider key | Desktop can resolve provider environment key | Persistent user-level local `COPILOT_BRIDGE_API_KEY` placeholder was present after restart; value was not logged | PASS |
| Desktop-to-Bridge request | Normal Store Desktop request reaches localhost provider | Proxy logged two Desktop `POST /v1/responses` requests from localhost | PASS |
| Compatibility routing | Desktop model identifiers use selected backend model | Logged `gpt-5.6-luna → gpt-5.6-terra` and `gpt-5.5 → gpt-5.6-terra` | PASS |
| SDK session | Real Copilot SDK session is created | Proxy logged two session creations using the authenticated official runtime | PASS |
| Stream completion | Desktop receives the requested response | User confirmed exact `DESKTOP_BRIDGE_E2E_OK`; one observed stream logged normal completion with nine deltas | PASS |
| Copilot CLI tool isolation | Copilot does not receive its built-in CLI tools | Dedicated E2E configuration used `allowedCliTools: []`; this text-only test declared no tools | PASS |

**PHASE 0D: PASS.**

The concurrent Desktop requests used different client model identifiers, so
the Bridge router must remain independent of the requested client model and
must apply the configured backend model to every request. This phase did not
exercise file, shell, edit, or external function tools; those remain the Phase
0E gate.

## Regression status after model routing

The full proxy suite reported 399/402 passing tests. The three failures are
pre-existing Windows portability assertions in `test/config.test.ts`: they
expect POSIX `/project/...` paths but Node resolves the fixtures to
`E:\project\...`. The new model-routing test, targeted route test, typecheck,
and build passed. No Tool Bridge regression was observed.

## Real Store Desktop Agent Tool E2E

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Desktop host access | Agent can operate in the user-selected unrestricted Bridge Profile | Bridge `config.toml` reloaded with `danger-full-access` and `on-request`; Agent accessed the `E:` project | PASS |
| Read tools | Read source and project test configuration | Desktop issued `exec_command` calls for `math.js` and `package.json`; both completed in the actual project directory | PASS |
| File edit | Repair the known math bug through Desktop tool execution | Desktop invoked its apply-patch runner; it updated `math.js` from subtraction to addition | PASS |
| Function-call output | Return tool result to the waiting model | The correlated patch call returned successful `function_call_output` with the updated file path | PASS |
| Same-turn continuation | Continue after the edit without replacing the Agent turn | The same Desktop turn issued final read and `npm test` calls after patch output | PASS |
| Shell/test | Run project test successfully | Desktop executed `npm test` in the sample project; exit code 0 and `tests passed` | PASS |
| Independent verification | Final file and test result match the claimed repair | `math.js` returns `left + right`; independent `npm test` exited 0 | PASS |
| Copilot tool boundary | Copilot does not execute its own CLI tools | Dedicated Bridge config continued to set `allowedCliTools: []`; Desktop executed all observed commands via external function tools | PASS |

**PHASE 0E: PASS.**

The initial Desktop Agent attempt exposed a function-call batching race when
adjacent SDK external-tool events arrived after the response was closed. A
25 ms batch window and regression test were added; targeted tests passed
15/15. The successful final repair also establishes that the Agent can access
the host project under the selected unrestricted Bridge permission profile.

## Final regression status

The final proxy test run reported 400/403 passing tests. The three failures
remain pre-existing Windows portability assertions in `test/config.test.ts`
that expect POSIX fixture paths but receive Windows paths. The post-fix
targeted Tool Bridge and model-routing tests, typecheck, and build passed.

**PHASE 0: NOT ACCEPTED.** Phase 0F session isolation, final current-Desktop
acceptance in both directions, and the packaged application-owned login and
profile-backend flows remain incomplete.

## Real bidirectional Desktop session isolation

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Bridge baseline | Bridge state is independent before restoration | 6 session files and 6 `session_index.jsonl` lines | PASS |
| Original baseline | Original state is distinct from Bridge | 128 session files and 119 index lines | PASS |
| Switch to Original | Clearing user `CODEX_HOME` and restarting activates default Home | User variable was unset; normal Desktop launch updated Original global state | PASS |
| Bridge preservation during Original use | Original launch does not add/remove Bridge sessions | Bridge remained at 6 session files and 6 index lines | PASS |
| Original preservation | Bridge state does not replace Original sessions | Original remained at 128 session files and 119 index lines | PASS |
| Restore Bridge | Setting Bridge `CODEX_HOME` and restarting reactivates Bridge Home | User variable matched Bridge Home; Desktop updated Bridge global state | PASS |
| Bridge session persistence | Earlier Bridge session index remains after restore | Bridge still had 6 session files and 6 index lines | PASS |
| Database integrity | State databases stay consistent in both Homes | All six Bridge and six Original SQLite `PRAGMA quick_check` results were `ok` | PASS |

**PHASE 0F: PASS.**

The validation records metadata only: session-file counts, index-line counts,
runtime timestamps, and SQLite integrity. It did not inspect chat messages,
authentication material, or session content. Original's final global-state
write occurred during its normal shutdown before Bridge was restored; it did
not change after the Bridge activation. Bridge Profile is currently active.

**PHASE 0: NOT ACCEPTED.** Phase 0G workspace isolation and the packaged
application-owned login and profile-backend flows remain incomplete.

## Real bidirectional Desktop workspace isolation

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Bridge workspace record | Bridge-only workspace remains in Bridge metadata | Bridge sentinel occurred in two Bridge session files | PASS |
| Original boundary | Original metadata never receives Bridge workspace record | No Bridge sentinel match in Original sessions | PASS |
| Original workspace record | Original-only workspace remains in Original metadata | Original sentinel occurred in one Original session file | PASS |
| Bridge boundary | Bridge metadata never receives Original workspace record | No Original sentinel match in Bridge sessions | PASS |
| Profile state after restore | Bridge session/index state persists when restored | Bridge activated with 8 session files and 8 index lines | PASS |
| Original state after Bridge restore | Bridge activation does not change Original workspace/session counts | Original stayed at 129 session files and 120 index lines | PASS |
| Database integrity | Workspace/profile state databases remain valid | All six Bridge and six Original SQLite `PRAGMA quick_check` results were `ok` | PASS |

**PHASE 0G: PASS.**

The sentinels contained no user data. The validation inspected only sentinel
presence/absence, file and index counts, timestamps, and database integrity;
it did not inspect conversation bodies or authentication material.

**PHASE 0 E2E GATES: PASS (0C-0G).** Full Phase 0 product acceptance remains
pending implementation of application-owned device-code OAuth, packaged
runtime selection, profile-switch transaction/recovery, restart UX, and
permission disclosure. Optional Phase 0H copy-only import has not been
started.

## UI-0 packaged renderer blank

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Portable startup | Electron main process opens a renderer window | Portable process and BrowserWindow started | PASS |
| Root cause | Identify why content was blank | Packaged preload was ESM but Electron executed it as CommonJS, so preload injection failed and renderer accessed an undefined bridge API | PASS |
| Preload repair | Renderer receives the intended API | Preload now compiles as CommonJS `preload.cjs` | PASS |
| Packaged renderer DOM | Main page content is visible | Remote debugging reported the full main-page text and `window.copilotBridge` as an object | PASS |
| Screenshot review | No blank renderer | Captured packaged renderer screenshot shows visible content | PASS |

UI-0 only establishes a non-blank packaged renderer. The screenshot does not
yet meet the new `UI_UX_PRD.md` visual specification; UI-1 onward must follow
that specification and be validated using real portable screenshots.

## UI-1 default menu removal

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Default application menu | No `File / Edit / View / Window` menu | `Menu.setApplicationMenu(null)` is applied before window creation | PASS |
| Native window controls | Windows minimize/maximize/close remain | Real portable desktop screenshot shows native controls | PASS |
| Packaged validation | Behavior is tested in portable output | Portable rebuild, launch, and desktop screenshot completed | PASS |

## UI-2 through UI-4 visual foundation

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Native controls | Keep Windows controls without default menu | `titleBarOverlay` preserves native controls and a 48px visual title bar | PASS |
| Default language | Main page is zh-CN | Temporary Hero/status/Profile labels replaced with Chinese product copy | PASS |
| Main layout | One Copilot card, one current-environment card, status bar | Dual Profile layout and permanent permission block removed | PASS |
| Default viewport | Core controls visible at default size | Real packaged renderer screenshot passed | PASS |
| DPI overflow | No main-page overflow at 125% and 150% | Packaged DOM checks reported no vertical or horizontal overflow; screenshots captured | PASS |

This accepts only the UI foundation. It does not accept authentication-state
verification, real model list/select controls, reasoning UI, settings, login
Modal, restart Modal, diagnostics, tray, or startup behavior.

## UI-5 through UI-11 packaged MVP integration

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Reusable controls | Shared controls are available | Button, Select, Toggle, Modal, and Sheet components are implemented | PASS |
| Bridge lifecycle | App starts packaged proxy without system Node | BridgeManager used bundled Node, unpacked proxy dependency, and packaged official Copilot runtime | PASS |
| Bridge health | App-managed proxy is reachable | `GET /health` returned HTTP 200 and protocol version 3 | PASS |
| Real models | Models are sourced from SDK, not hardcoded | `/bridge/models` returned 11 models | PASS |
| Reasoning capabilities | Reasoning UI derives from actual capabilities | 7 returned models supported reasoning; Terra selection displayed the reasoning select | PASS |
| Setting persistence | Model/reasoning changes restart the real Bridge | Renderer persisted `gpt-5.6-terra` and `high`; post-restart health remained `ok` | PASS |
| Main status | UI reports real Bridge state | Portable renderer displayed `已连接` and `Copilot Bridge 正常` only after app-managed health succeeded | PASS |
| Overflow | Core controls remain visible | Packaged DOM reported no horizontal or vertical overflow | PASS |

The GitHub Login Modal and environment Setup/Progress/Restart dialogs are
implemented but do not yet have fresh-login or app-driven restart E2E evidence.

## Version 0.1.0 NSIS installer

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Installer artifact | One executable installer, not an archive | `Copilot Bridge Setup 0.1.0.exe` built successfully | PASS |
| Installation scope | Per-user install without administrator dependency | Installed under `%LOCALAPPDATA%\Programs\Copilot Bridge` | PASS |
| Shortcuts | Desktop and Start Menu access | Both `Copilot Bridge.lnk` shortcuts were created | PASS |
| Installed launch | Application avoids portable self-extraction path | Running process executable path was the installed application path | PASS |
| Installed Bridge | Installed app launches actual Bridge | `GET /health` returned `ok`; `/bridge/models` returned 11 models | PASS |

The installer is the MVP release channel. The portable EXE remains a
development/diagnostic artifact only.

## Phase A ChatGPT bootstrap foundation

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| AppX detection | Detect current ChatGPT through package registration | Direct Windows AppX query detected `OpenAI.Codex`, package family `OpenAI.Codex_2p2nqsd0c76g0`, version `26.915.4065.0`; packaged fallback detects installed family and launch identity | PARTIAL |
| Launch identity | Retrieve a launchable current App identity | Detected `OpenAI.Codex_2p2nqsd0c76g0!App` through StartApps | PASS |
| Official install path | Only official Store source is selected | `winget` msstore product `9PLM9XGG6VKS` and Store fallback installed ChatGPT; direct AppX registration returned `OpenAI.Codex 26.915.4065.0` | PASS |
| Original state | Distinguish absent/default/custom Original Home | `UNINITIALIZED`, `READY`, and `CUSTOM` states implemented | IMPLEMENTED |
| Custom restore | Restore a pre-existing custom `CODEX_HOME` | Automated ProfileStore test passed | PASS |

No ChatGPT package was uninstalled or installed on this development machine.
Fresh-install and zero-login acceptance remain pending.

The packaged child process cannot currently obtain a trustworthy current AppX
version through `Get-AppxPackage`; its fallback intentionally returns only the
trusted installed family/AppID rather than displaying an older activation
registry version. Current-version display remains a Phase A follow-up.

## Startup and tray foundation

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Single instance | Repeated launches do not create duplicate Bridge main processes | Two isolated launches resulted in one main process | PASS |
| Startup defaults | Startup/tray/Bridge defaults persist | All three settings defaulted to true in packaged diagnostics | PASS |
| Bridge auto-start | Packaged app starts Bridge when enabled | Bridge diagnostics reported `ready` and health returned `ok` | PASS |
| Tray lifecycle | Tray and close-to-tray are implemented | Implemented; visual Windows login/tray E2E pending | IMPLEMENTED |
| Windows auto-launch | Login item is configured from persisted setting | Implemented; next-login E2E pending | IMPLEMENTED |

## Official ChatGPT installation progress UX

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Uninstalled state | No installed package exposes install action | Packaged detector returned `NOT_INSTALLED` | PASS |
| Official install request | Uses only Microsoft Store source | Test invoked `winget install` with msstore product `9PLM9XGG6VKS` | PASS |
| User progress | Installation exposes actionable stages | Packaged Modal displayed check, install, verification, and Copilot preparation steps | PASS |
| Cancellation | Cancel clears the install child process | Cancellation left zero matching `winget` processes | PASS |
| Store completion | Official Store installation completes | Store displayed ChatGPT as available to open; AppX registration returned current package identity/version | PASS |
| App automatic continuation | Modal closes after new AppX registration | Old test build retained a waiting Modal because of the former winget-first detector; fixed build now detects the installed package at startup. Full fresh-cycle recheck remains pending. | PARTIAL |

The current machine was deliberately uninstalled for this progress-flow test.
The source now polls registration after Store fallback and refreshes App state
when `INSTALLED` is observed; a full successful Store installation still
requires user completion and post-install verification.

## ATT-2 / ATT-3 Attachment Compatibility Layer

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Desktop local path conversion | Explicit Desktop file mention becomes SDK file attachment | Unit test passed; resolver emits one path attachment | PASS |
| Data URL conversion | `input_image` data URL becomes SDK blob attachment | Unit test passed; resolver emits MIME-aware blob attachment | PASS |
| Duplicate prevention | Desktop image path plus data URL is not sent twice | Resolver prefers local path-backed attachment | PASS |
| Attachment type policy | Unsupported local/executable and inline MIME types are rejected | 10MB limit plus extension/MIME allowlist unit coverage | PASS |
| Provider forwarding | Resolved attachment reaches Copilot SDK first message | Provider-level test asserts `session.send({ prompt, attachments })` | PASS |
| TXT proxy E2E | Provider receives attached text file | Direct SDK/proxy probe passed, but current packaged Bridge does not expose fixture text to model | PARTIAL |
| PNG path proxy E2E | Provider receives path-backed image | Real probe read image text `ORANGE-714` | PASS |
| PNG data URL proxy E2E | Provider receives inline image | Real probe read image text `ORANGE-714` | PASS |
| Tool Bridge regression | Existing tool continuation is retained | Focused Codex/Tool Bridge/integration/model routing suite: 75 passed | PASS |
| Full proxy regression | Existing suite remains healthy | 405/408 passed; 3 known Windows path-separator assertions failed | BASELINE |
| Packaged Bridge smoke | Newly packaged Bridge starts normally | `win-unpacked` `/health` returned HTTP 200, protocol 3 | PASS |
| Packaged TXT path attachment | Model reads `attachment-sample.txt` fixture | Request returned SSE, but model could not access `alpha beta gamma` | BLOCKED |

Desktop Ctrl+V/drag/file-picker and Desktop PNG/TXT end-to-end acceptance are
still pending because re-entering Bridge Desktop mode requires restart and
restart is blocked by the Windows kernel crash issue.

## Phase A packaged detection and single-instance check

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Packaged AppX IPC | Renderer receives real installed ChatGPT state | `INSTALLED` returned package identity, version, family and StartApps AppID | PASS |
| Diagnostics IPC | App diagnostics uses actual subsystem state | Returned Bridge `ready`, ChatGPT `INSTALLED`, Original `READY`, and persisted startup settings | PASS |
| Single instance | Second launch focuses existing app instead of creating another main process | Two launches using isolated user data left one main process | PASS |
| Startup defaults | App persists startup behavior settings | `autoLaunch`, `minimizeToTray`, and `autoBridgeStart` all defaulted to true | PASS |

Official package installation was not invoked because this test machine already
has ChatGPT. Zero-login, tray-visible-after-login, and restart-dependent
acceptance remain pending.

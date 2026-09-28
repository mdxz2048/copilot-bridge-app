# Local MVP Continuation Handoff

## Read First

Before changing code, read:

1. `docs/MASTER_PRD.md`
2. `docs/PRODUCT_CONTINUATION_PRD.md`
3. `docs/DEVELOPMENT_STATUS.md`
4. `docs/ROADMAP.md`
5. `docs/BLOCKERS.md`
6. `docs/DECISIONS.md`
7. `docs/CHANGELOG_DEV.md`
8. `docs/architecture/attachment-artifact-investigation.md`
9. `docs/architecture/attachment-runtime-diff.md`
10. `docs/acceptance/phase-0.md`
11. `docs/UI_UX_PRD.md`

The latest user direction is the Local MVP product-delivery charter: use
existing Desktop/Codex filesystem tools and the existing Tool Bridge before
adding any `ResourceRegistry`, custom file protocol, or specialized file tool.

## Non-Negotiable Architecture

```text
ChatGPT Desktop / Codex = local tool executor
Copilot = reasoning and tool selection
Tool Bridge = function_call / function_call_output relay
Bridge = local Responses compatibility layer
```

Do not:

- rewrite Responses, Tool Bridge, or same-session continuation;
- enable `allowedCliTools: ["*"]`;
- grant shell/write/read wildcard permissions to the Copilot runtime;
- create an Asset Server, Remote Gateway, S3/MinIO, file-manager UI, RAG, or
  a generic upload platform;
- treat an ordinary path in user text as attachment authorization;
- restart Windows for E2E. `BLOCKER-003` remains open.

Images remain on the SDK vision path. Do not OCR them by default.

## Current Attachment Findings

`docs/architecture/attachment-runtime-diff.md` is authoritative:

```text
Official CLI 1.0.75 + SDK 1.0.1 + gpt-5.6-terra
PNG path/blob: PASS
TXT path/blob: FAIL
```

This is an upstream native text-attachment limitation, not a permission,
Electron, proxy, or runtime-packaging issue. Keep `BLOCKER-004`; it may be
mitigated by local tool workflow, but not resolved.

The current production Codex handler intentionally calls
`formatResponsesPrompt`, not the experimental text-inline formatter. Do not
re-enable inline fallback. The uncalled formatter and its tests in
`src/providers/codex/prompt.ts` / `test/providers/codex/prompt.test.ts` are
experimental work from the superseded direction and should be removed
surgically once their unrelated attachment tests are preserved.

## Current FILE-0A Result

Harness:

```text
upstream-copilot-sdk-proxy/scripts/file-workflow-harness.mjs
```

It creates a temporary 4,000-line `Pasted text #1.txt`. The marker
`LONGTEXT-731` is at line 2318 and is not in the prompt. It starts a local,
restricted proxy with:

```text
allowedCliTools: []
autoApprovePermissions: false
```

It declares an external `read_file` tool and permits only the one harness
fixture path.

The final cleanup rerun passed:

```text
Pasted Text via existing Read: PASS
markerFound: true
external read_file calls: 20
same-session function_call_output continuation: PASS
Harness cleanup: PASS
```

The model requested multiple line ranges and found the marker at line 2318.
The proxy exited, its allocated port closed, and the temporary fixture
directory was removed.

## Completed Work: FILE-0B Through FILE-0G

The harness remains test-only code, not a production filesystem execution
layer. It uses Desktop-style file mentions:

```text
# Files mentioned by the user:

## filename.ext:
C:\absolute\fixture\path
```

The model must call existing external tools through Tool Bridge. Execute tool
requests only within the harness fixture root and return structured errors for
other paths.

### FILE-0B

Run marker-hidden read E2E:

| Fixture | Marker |
| --- | --- |
| TXT | `TXT-482` |
| Markdown | `MD-613` |
| JSON | `JSON-927` |
| TypeScript source | `CODE-351` |

Use existing external `read_file`; ensure the prompt does not contain markers.

### FILE-0C

Create `sales.csv` with Alice/Bob/Carol sales and marker `CSV-418`.
Verify read/analyze, modify, create, and disk reread. Reuse `read_file` and a
strictly fixture-scoped harness tool; do not add a production CSV tool.

### FILE-0D / FILE-0F

Create `sales.xlsx` with Bob highest and marker `EXCEL-638`. First attempt
existing external shell-style tool plus local Python/openpyxl in the harness.
The harness must allow only generated fixture-root scripts/files. Verify:

- workbook read and analysis;
- Bob changed to 10000;
- reopen with openpyxl and assert the saved cell value;
- generated XLSX exists and reopens correctly.

If Python/openpyxl is unavailable or the model cannot reliably use the
existing shell workflow, record that result; do not immediately add a
specialized spreadsheet tool.

### FILE-0E

Verify text/source edit/patch through existing external tools, then reread
disk content.

### FILE-0G

Verify `result.txt`, `result.csv`, and `result.xlsx` are created under the
fixture root and have correct contents/format after reopening/parsing.

### Cross-Cutting

- Add arbitrary-path negative case: a prompt containing
  `C:\Users\HP\.ssh\id_rsa` without a Desktop file mention must never cause
  harness authorization or production attachment registration.
- Run PNG marker-hidden vision regression (`ORANGE-714`) separately; images
  stay on SDK attachment path.
- Preserve and run existing Tool Bridge regression.
- Do not call a synthetic harness result Desktop UI E2E. Report:

```text
WORKFLOW_E2E: PASS/FAIL
DESKTOP_UI_E2E: BLOCKED_BY_BLOCKER_003
```

## Known Current Files and Changes

Production relevant:

- `upstream-copilot-sdk-proxy/src/providers/codex/prompt.ts`
- `upstream-copilot-sdk-proxy/src/providers/codex/provider.ts`
- `upstream-copilot-sdk-proxy/src/providers/codex/handler.ts`
- `upstream-copilot-sdk-proxy/src/providers/codex/tool-bridge.ts`
- `upstream-copilot-sdk-proxy/src/providers/codex/streaming.ts`
- `upstream-copilot-sdk-proxy/src/providers/shared/streaming-core.ts`

Harness:

- `upstream-copilot-sdk-proxy/scripts/file-workflow-harness.mjs`

Fixture directory:

```text
C:\Users\HP\Documents\CopilotBridgeAttachmentProbe
```

It contains image and basic text/CSV/XLSX probes. Fixture files are
non-sensitive; ensure marker-hidden prompts.

Temporary probe configs belong in the session folder and must be deleted after
each probe.

## Validation Baseline

Before FILE workflow changes:

```text
npm run build       PASS
npm run typecheck   PASS
```

The final focused prompt and Tool Bridge suite passed 29/29. The full suite
passed 406/409 with the same three pre-existing Windows path-separator
assertion failures in `test/config.test.ts`. Build and typecheck passed.

## Completion Report Format

Use exactly:

```text
FILE WORKFLOW RELEASE STATUS

Pasted Text
TXT
Markdown
JSON
Source
CSV
XLSX Read
XLSX Modify
TXT/CSV/XLSX Create
PNG Vision
Sequential Tool Calls
Same Session
Harness Cleanup

NEED_RESOURCE_REGISTRY
NEED_SPECIALIZED_SPREADSHEET_TOOL
BLOCKER-004 PRODUCT IMPACT
```

Each row must be PASS, FAIL, BLOCKED, or INVALID with concise evidence.

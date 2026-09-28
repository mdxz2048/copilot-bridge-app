# Attachment Runtime Differential Investigation

## Scope

This investigation compares the same 84-byte TXT fixture and 2710-byte PNG
fixture with fresh Node processes, fresh `CopilotClient` instances, and fresh
sessions. It does not enable shell, write, wildcard built-in tools, or extra
permissions.

The TXT fixture contains `ALPHA-482`; the PNG fixture visibly contains
`ORANGE-714`. The probe prompt does not disclose either marker.

## Trusted Matrix

| Environment | TXT path | TXT blob | PNG path | PNG blob |
| --- | --- | --- | --- | --- |
| Direct Global | FAIL | FAIL | PASS | PASS |
| Direct Bundled | FAIL | FAIL | PASS | PASS |
| Proxy Bundled | INVALID | INVALID | INVALID | INVALID |
| Electron Packaged | INVALID | INVALID | INVALID | INVALID |

The Proxy and Electron requests initially included the expected marker in
their prompt, making a model echo indistinguishable from successful attachment
consumption. They are intentionally excluded from the trusted matrix rather
than misreported as PASS/FAIL.

This does not leave the root cause ambiguous: Direct Global reproduces the
TXT failure before the proxy or Electron layers exist.

## Direct Evidence

Both direct environments used:

| Field | Value |
| --- | --- |
| SDK version | `@github/copilot-sdk` 1.0.1 |
| Runtime version | GitHub Copilot CLI 1.0.75 |
| Runtime SHA256 | `0F6CE49CAF19066374DF34D1B9AA790A19DC32B70AB76780662ADF4647B5DE5E` |
| Node | v22.17.0 |
| Model | `gpt-5.6-terra` |
| Working directory | `E:\0_code\3_lzp\copilot_bridge` |
| Session config | fresh client/session; streaming; no custom tools or permission expansion |

The global runtime path and packaged runtime path differ, but their version
and SHA256 are identical. `user.message` events recorded `file` for path
tests and `blob` for blob tests in all eight direct runs. Thus the SDK
serialized both attachment forms to the runtime.

Only metadata was recorded: event type, attachment type, fixture basename,
MIME, byte size, and SHA256. No credentials or fixture contents were logged.

## SDK Attachment Semantics

The SDK's public `MessageOptions` supports `file` and `blob` attachments.
`session.js` forwards `options.attachments` directly through the generated RPC;
the SDK does not locally convert a file attachment into a blob. Generated
runtime event types distinguish ordinary attachments from
`nativeDocumentPathFallbackPaths`, described as paths retained on the
`tagged_files` flow when native upload cannot read them or exceeds its size
limit.

The observed behavior is MIME-dependent:

- `image/png` succeeds for both path and blob.
- `text/plain` is accepted and represented in `user.message`, but its marker
  is not made available to `gpt-5.6-terra` for either path or blob.

Therefore `file` is neither a guaranteed binary upload nor a guaranteed
runtime-readable path. The runtime/model selects its attachment treatment.

## Root Cause

**Official runtime/model limitation for text attachment consumption.**

The claimed earlier direct TXT PASS was invalidated by the fresh, marker-hidden
probe. The same official runtime binary fails before the proxy and Electron
layers are involved. The proxy cannot be the cause of a failure that exists in
Direct Global, and Electron cannot be the cause because its bundled binary is
byte-identical to the global runtime.

## Product Decision

1. Keep the existing AttachmentResolver forwarding and 10MB limit.
2. Treat PNG input as supported at the SDK/runtime layer (Desktop E2E remains
   separately blocked by BLOCKER-003).
3. Do not claim TXT, CSV, JSON, Markdown, or code-file understanding through
   the current SDK attachment route.
4. Do not enable `allowedCliTools: ["*"]`, shell/write permissions, or
   unrestricted local reads as a workaround.
5. Do not build a DocumentResolver in this round. Any text fallback requires a
   separately approved local-content design and a marker-hidden E2E probe.

## Reusable Probe

`upstream-copilot-sdk-proxy/scripts/attachment-runtime-probe.mjs` creates a
fresh direct client/session for each case and emits sanitized JSON metadata.

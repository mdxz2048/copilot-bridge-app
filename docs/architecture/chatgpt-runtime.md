# ChatGPT Desktop Runtime Investigation

Date: 2026-09-21

## Observed Desktop runtime

- ChatGPT Desktop is the Microsoft Store package
  `OpenAI.Codex_26.915.4065.0_x64__2p2nqsd0c76g0`.
- Its executable is
  `C:\Program Files\WindowsApps\OpenAI.Codex_26.915.4065.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe`.
- Its Chromium user-data argument is
  `%APPDATA%\Codex\web\Codex`.
- Its bundled Codex runtime is
  `%LOCALAPPDATA%\OpenAI\Codex\bin\247581e40ee272fb\codex.exe`.
- That bundled runtime reports `codex-cli 0.155.0-alpha.9.2` and exposes
  `codex app-server`; it is distinct from the separately installed npm CLI
  0.142.3.

## Original data boundaries

- `%USERPROFILE%\.codex` contains the Original Codex configuration, session,
  SQLite, cache, and plugin state.
- `%APPDATA%\Codex\web\Codex` is the Desktop application's Chromium user-data
  directory.
- No Original configuration, authentication, session, SQLite, cache, or
  workspace data was read, copied, changed, moved, renamed, or deleted during
  this investigation.

## Model cache version evidence

`%USERPROFILE%\.codex\models_cache.json` declares client version `0.155.0`,
which corresponds to the Desktop bundled runtime, not the npm CLI 0.142.3.
The older CLI reports the cache schema as incompatible. Product runtime
decisions must therefore be based on the Desktop bundled runtime.

## Open questions requiring a controlled restart

The Desktop app-server supports command-line config overrides, but the
existing running ChatGPT process cannot have its environment retroactively
changed.

## Controlled launch result

An authorized restart experiment was performed:

1. The existing ChatGPT process tree was stopped using its concrete process
   identifiers.
2. An empty Bridge Home was created at
   `%LOCALAPPDATA%\CopilotBridge\profiles\bridge\codex-home`, containing only
   a test configuration. No Original auth, sessions, cache, history, SQLite,
   skills, MCP configuration, or workspace data was copied.
3. Directly starting the Store package's `ChatGPT.exe` with `CODEX_HOME` in
   the caller environment failed with WindowsApps access denied.
4. The supported registered activation
   `shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App` successfully restored
   ChatGPT, but activation is brokered by Explorer and does not provide a
   demonstrated environment-injection channel.

The controlled launch therefore did **not** prove that ChatGPT Desktop adopts
an injected `CODEX_HOME`. ChatGPT was restored immediately through the
registered launcher. The Original environment was not modified.

Further work must identify a supported Desktop/app-server profile mechanism
before a production switcher can claim isolated Desktop environments. It must
not rely on direct Store package executable launch or modify Original data.

## Normal-user DesktopLaunchProbe result

`DesktopLaunchProbe.exe` was run by a normal user through its generated
launcher after ChatGPT was manually closed. Its report showed:

- direct launch with an explicit `CODEX_HOME` failed with the same
  WindowsApps access-denied error;
- no ChatGPT child process was created;
- the Bridge Temp Home contained only its newly created `config.toml`;
- Original Home metadata was unchanged before and after the attempt.

This proves that the direct Store-package launch failure is not specific to
the development Agent sandbox. It does **not** prove that ChatGPT Desktop
ignores `CODEX_HOME`: direct package execution itself is blocked before the
application can start. The product must evaluate supported app-server profile
or home configuration before considering the junction fallback.

## App-server Bridge Home proof

The Desktop bundled `codex.exe` was started independently through its
`app-server --stdio` interface with `CODEX_HOME` set to a new Bridge Temp
Home. Its `initialize` response returned that exact absolute `codexHome`.

A second isolated run created Bridge-only state:

- `goals_1.sqlite`
- `logs_2.sqlite`
- `memories_1.sqlite`
- `queue_1.sqlite`
- `state_5.sqlite`
- `skills`, `tmp`, and `.tmp`

Before and after the run, Original Home retained the same top-level entry
count (`75`) and directory last-write timestamp. This is a real positive
proof that the Desktop bundled app-server honors `CODEX_HOME` and keeps
runtime state in the Bridge Home.

It is not yet proof that the Store-packaged ChatGPT Desktop shell can be
launched into or attached to that isolated app-server environment.

## Remaining proof obligations

A supported independent-home launch is required to prove:

1. whether ChatGPT Desktop adopts the injected home;
2. which state is isolated by that home; and
3. whether Original sessions and workspace state remain untouched.

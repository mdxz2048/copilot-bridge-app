export function chatGptStopScript(bridgePid: number, graceSeconds = 8, appId?: string): string {
  if (!Number.isSafeInteger(bridgePid) || bridgePid < 1 || !Number.isSafeInteger(graceSeconds) || graceSeconds < 0) throw new Error("Invalid restart options");
  if (appId && !/^OpenAI\.Codex_[a-z0-9]+![a-z0-9_.-]+$/i.test(appId)) throw new Error("Invalid official application ID");
  const publisher = appId?.split("_")[1]?.split("!")[0];
  return [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)",
    "$package = $null; try { $package = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction Stop | Select-Object -First 1 } catch { }",
    "$root = $null; if ($package.InstallLocation) { $root = [IO.Path]::GetFullPath($package.InstallLocation).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar }",
    `if (-not $root -and ${publisher ? "$false" : "$true"}) { throw 'RESTART_PACKAGE_UNAVAILABLE' }`,
    "$windowsApps = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'WindowsApps')).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar",
    `function Test-OfficialPath($path) { if (-not $path) { return $false }; if ($root) { return $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) }; if (-not $path.StartsWith($windowsApps,[StringComparison]::OrdinalIgnoreCase)) { return $false }; $folder = $path.Substring($windowsApps.Length).Split([IO.Path]::DirectorySeparatorChar)[0]; return $folder -match '^OpenAI\\.Codex_[0-9.]+_(x64|x86|arm64|neutral)__${publisher ?? "NO_PUBLISHER"}$' }`,
    `$targets = @(foreach ($candidate in @(Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue)) { if ($candidate.Id -eq ${bridgePid}) { continue }; try { $path=$candidate.Path; $started=$candidate.StartTime; if (Test-OfficialPath $path) { [pscustomobject]@{Id=$candidate.Id;Path=$path;Started=$started;Process=$candidate} } } catch { } })`,
    "foreach ($snapshot in $targets) { try { [void]$snapshot.Process.CloseMainWindow() } catch { } }",
    `$deadline = [DateTime]::UtcNow.AddSeconds(${graceSeconds})`,
    "while ([DateTime]::UtcNow -lt $deadline) { $remaining = @(foreach ($snapshot in $targets) { $running = Get-Process -Id $snapshot.Id -ErrorAction SilentlyContinue; if ($running) { $running } }); if (-not $remaining.Count) { break }; Start-Sleep -Milliseconds 200 }",
    // Closing the parent can terminate child processes between enumeration and Stop-Process.
    "foreach ($snapshot in $targets) { $current = Get-Process -Id $snapshot.Id -ErrorAction SilentlyContinue; if (-not $current) { continue }; try { $same = (Test-OfficialPath $current.Path) -and $current.StartTime -eq $snapshot.Started } catch { continue }; if (-not $same) { continue }; try { Stop-Process -Id $current.Id -Force -ErrorAction Stop } catch { if ($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId,*') { throw } } }",
  ].join("; ");
}

/** UTF-16 encoded scripts avoid ANSI command-line corruption; stderr is emitted as UTF-8 JSON. */
export function chatGptRestartCommand(bridgePid: number, appId: string): string[] {
  const script = "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); [Console]::Error.Write(''); try { "
    + chatGptStopScript(bridgePid, 8, appId)
    + "; [Console]::Out.Write('{\"ok\":true}') } catch { [Console]::Error.Write((@{ code='RESTART_STOP_FAILED'; detail=$_.Exception.Message } | ConvertTo-Json -Compress)); exit 1 }";
  return ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")];
}

export function chatGptRestartError(error: unknown): string {
  const value = error && typeof error === "object" ? error as { stderr?: unknown; stdout?: unknown; killed?: boolean; code?: unknown } : {};
  if (value.killed || value.code === "ETIMEDOUT") return "ChatGPT 关闭超时，请先保存工作并手动关闭 ChatGPT，再点击打开；Bridge 仍在运行。";
  const text = typeof value.stderr === "string" ? value.stderr.trim() : "";
  let detail = text;
  try { const parsed = JSON.parse(text); detail = typeof parsed.detail === "string" ? parsed.detail : text; } catch { }
  if (detail.includes("RESTART_PACKAGE_UNAVAILABLE")) return "官方客户端的安装注册信息不完整，请修复安装后再重启；Bridge 仍在运行。";
  if (/access.*denied|permission|拒绝访问|权限/i.test(detail)) return "Windows 拒绝关闭 ChatGPT。请手动关闭后重新打开，或使用与 ChatGPT 相同的权限启动 Bridge。";
  if (value.code === "ENOENT") return "无法启动 Windows PowerShell，请手动关闭并重新打开 ChatGPT。";
  return `无法重启 ChatGPT${detail ? `：${detail.replace(/\r?\n/g, " ").slice(0, 240)}` : "，Windows 未返回错误详情。请手动关闭后重新打开"}；Bridge 仍在运行。`;
}

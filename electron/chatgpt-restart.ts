export function chatGptStopScript(bridgePid: number, graceSeconds = 8): string {
  if (!Number.isSafeInteger(bridgePid) || bridgePid < 1 || !Number.isSafeInteger(graceSeconds) || graceSeconds < 0) throw new Error("Invalid restart options");
  return [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)",
    "$package = Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -First 1",
    "if (-not $package.InstallLocation) { throw '无法确认官方客户端安装路径，请手动重启。' }",
    "$root = [IO.Path]::GetFullPath($package.InstallLocation).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar",
    `$targets = @(Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ${bridgePid} -and $_.Path -and $_.Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) })`,
    "foreach ($target in $targets) { try { [void]$target.CloseMainWindow() } catch { if (-not $target.HasExited) { throw } } }",
    `$deadline = [DateTime]::UtcNow.AddSeconds(${graceSeconds})`,
    "while ([DateTime]::UtcNow -lt $deadline -and @($targets | Where-Object { -not $_.HasExited }).Count) { Start-Sleep -Milliseconds 200; $targets | ForEach-Object { $_.Refresh() } }",
    // Closing the parent can terminate child processes between enumeration and Stop-Process.
    "foreach ($target in $targets) { $current = Get-Process -Id $target.Id -ErrorAction SilentlyContinue; if (-not $current -or $current.HasExited) { continue }; if (-not $current.Path -or -not $current.Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or $current.StartTime -ne $target.StartTime) { continue }; try { Stop-Process -Id $current.Id -Force -ErrorAction Stop } catch { if ($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId,*') { throw } } }",
  ].join("; ");
}

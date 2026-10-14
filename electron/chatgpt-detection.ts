/** Local evidence only: Store connectivity and winget are not installation checks. */
export const officialChatGptDetectionScript = String.raw`
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function Test-OfficialChatGptRoot($root) {
  try {
    $manifestPath = Join-Path $root 'AppxManifest.xml'
    if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath (Join-Path $root 'app\ChatGPT.exe'))) { return $false }
    [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop
    $identity = $manifest.Package.Identity
    return $identity.Name -eq 'OpenAI.Codex' -and $identity.ProcessorArchitecture -eq 'x64' -and $identity.Publisher -eq 'CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B'
  } catch { return $false }
}
$package = $null
try { $package = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction Stop | Where-Object { $_.Status -eq 0 -and $_.PackageFamilyName -eq 'OpenAI.Codex_2p2nqsd0c76g0' } | Select-Object -First 1 Name,PackageFullName,PackageFamilyName,Version,Status } catch { }
$app = $null
try { $app = Get-StartApps -ErrorAction Stop | Where-Object { $_.AppID -eq 'OpenAI.Codex_2p2nqsd0c76g0!App' } | Select-Object -First 1 Name,AppID } catch { }
$windowsApps = Join-Path $env:ProgramFiles 'WindowsApps'
$registered = Get-ChildItem 'Registry::HKEY_CURRENT_USER\Software\Classes\ActivatableClasses\Package' -ErrorAction SilentlyContinue |
  Where-Object { $_.PSChildName -match '^OpenAI\.Codex_[\d.]+_x64__2p2nqsd0c76g0$' } |
  Sort-Object { [version](($_.PSChildName -split '_')[1]) } -Descending |
  Where-Object { Test-OfficialChatGptRoot (Join-Path $windowsApps $_.PSChildName) } |
  Select-Object -First 1 -ExpandProperty PSChildName
$directoryPackage = Get-ChildItem -LiteralPath $windowsApps -Directory -Filter 'OpenAI.Codex_*_x64__2p2nqsd0c76g0' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^OpenAI\.Codex_[\d.]+_x64__2p2nqsd0c76g0$' } |
  Sort-Object { [version](($_.Name -split '_')[1]) } -Descending |
  Where-Object { Test-OfficialChatGptRoot $_.FullName } |
  Select-Object -First 1 -ExpandProperty Name
$runningPackage = $null
foreach ($process in @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue)) {
  try {
    if ($process.Path -notlike ($windowsApps + '\OpenAI.Codex_*_x64__2p2nqsd0c76g0\app\ChatGPT.exe')) { continue }
    $root = Split-Path (Split-Path $process.Path -Parent) -Parent
    if (Test-OfficialChatGptRoot $root) { $runningPackage = Split-Path $root -Leaf; break }
  } catch { }
}
[pscustomobject]@{ package = $package; app = $app; registered = $registered; registeredUsable = [bool]$registered; directoryPackage = $directoryPackage; runningPackage = $runningPackage } | ConvertTo-Json -Compress
`;

export function isOfficialChatGptPackageName(value: string | undefined): boolean {
  return /^OpenAI\.Codex_\d+(?:\.\d+){3}_x64__2p2nqsd0c76g0$/.test(value ?? "");
}

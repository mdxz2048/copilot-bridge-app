import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, rename, rm, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";

const origin = "https://ai.mddxz.top";
const filename = "ChatGPT-Windows-x64.zip";
const downloadUrl = `${origin}/api/v1/official-client/files/${filename}`;
const maxSize = 1024 * 1024 * 1024;
export type OfflineExecutor = (file: string, args: string[], options?: { timeout?: number; windowsHide?: boolean }) => Promise<{ stdout: string; stderr: string }>;
export interface OfflineInstallOptions { fetch?: typeof fetch; execute: OfflineExecutor; progress: (message: string) => void; signal?: AbortSignal; installationStarted?: () => void }
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

// Execute only our local installer logic; scripts supplied inside the ZIP are never run.
export function offlineInstallScript(archive: string, destination: string): string {
  return `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=${quote(archive)}; $destination=${quote(destination)}
$allowed=@('ChatGPT-x64.msix','ChatGPT-License.xml','Install-ChatGPT.ps1','Install-ChatGPT.cmd','README.txt')
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try {
  if ($zip.Entries.Count -ne 5) { throw 'Unexpected ZIP entries.' }
  $seen=@{}
  $total=0
  foreach ($entry in $zip.Entries) {
    if ($allowed -cnotcontains $entry.FullName -or $seen.ContainsKey($entry.FullName)) { throw 'Unsafe ZIP entry.' }
    $limit=1048576; if ($entry.FullName -eq 'ChatGPT-x64.msix') { $limit=${maxSize} }
    $total += $entry.Length
    if ($entry.Length -gt $limit -or $entry.Length -lt 1 -or $total -gt ${maxSize+4*1024*1024}) { throw 'Invalid ZIP entry size.' }
    $seen[$entry.FullName]=$true
  }
  foreach ($name in @('ChatGPT-x64.msix','ChatGPT-License.xml')) {
    $entry=$zip.GetEntry($name)
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $destination $name),$false)
  }
} finally { $zip.Dispose() }
$package=Join-Path $destination 'ChatGPT-x64.msix'; $license=Join-Path $destination 'ChatGPT-License.xml'
$msix=[IO.Compression.ZipFile]::OpenRead($package)
try {
  $reader=New-Object IO.StreamReader($msix.GetEntry('AppxManifest.xml').Open())
  try { [xml]$manifest=$reader.ReadToEnd() } finally { $reader.Dispose() }
  $identity=$manifest.Package.Identity
  if ($identity.Name -ne 'OpenAI.Codex' -or $identity.ProcessorArchitecture -ne 'x64' -or $identity.Publisher -ne 'CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B') { throw 'Unexpected official package identity.' }
  if (-not $msix.GetEntry('AppxSignature.p7x')) { throw 'Package signature missing.' }
} finally { $msix.Dispose() }
$signature=Get-AuthenticodeSignature -LiteralPath $package
if ($signature.Status -ne 'Valid') { throw 'Official package signature is invalid or untrusted.' }
# Windows deployment validates the Appx signature and trust chain before installing.
# Provisioning uses only the verified original MSIX and license, never ZIP scripts.
$elevated=@'
$ErrorActionPreference='Stop'
try { Add-AppxProvisionedPackage -Online -PackagePath '__PACKAGE__' -LicensePath '__LICENSE__' -Regions all | Out-Null; exit 0 } catch { exit 1 }
'@
$elevated=$elevated.Replace('__PACKAGE__',$package.Replace("'","''")).Replace('__LICENSE__',$license.Replace("'","''"))
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($elevated))
$process=Start-Process -FilePath "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Verb RunAs -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand',$encoded -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -ne 0) { throw 'Offline provisioning failed. Check administrator permission and Windows installation policy.' }
Add-AppxPackage -Path $package -ErrorAction Stop
$registered=Get-AppxPackage -Name 'OpenAI.Codex' | Where-Object { $_.PackageFamilyName -eq 'OpenAI.Codex_2p2nqsd0c76g0' -and $_.Status -eq 0 } | Select-Object -First 1
if (-not $registered) { throw 'Package registration failed.' }
[pscustomobject]@{installed=$true;version=[string]$registered.Version}|ConvertTo-Json -Compress`;
}

export async function installOfficialClient(directory: string, options: OfflineInstallOptions): Promise<void> {
  const request = options.fetch ?? fetch;
  const signal=(timeout:number)=>options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
  const response = await request(`${origin}/api/v1/official-client/windows`, { redirect: "error", signal: signal(30000) });
  if (!response.ok) throw new Error("官方安装包暂时不可用，请稍后重试。");
  const manifest = await response.json() as Record<string, unknown>;
  if (manifest.arch !== "x64" || manifest.filename !== filename || manifest.downloadUrl !== downloadUrl || typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(manifest.sha256) || !Number.isSafeInteger(manifest.size) || Number(manifest.size) < 1 || Number(manifest.size) > maxSize) throw new Error("官方安装包清单无效。");
  const root=resolve(directory);
  await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink()) throw new Error("安装缓存目录不安全。");
  const workspace=await mkdtemp(join(root,"install-"));
  try {
    const archive=join(workspace,filename), partial=archive+".part";
    options.progress("正在下载官方 ChatGPT 安装包…");
    const file=await open(partial,"wx");
    let downloaded=0, lastProgress=0; const digest=createHash("sha256");
    try {
      const body=await request(downloadUrl,{redirect:"error",signal:signal(15*60*1000)});
      if(!body.ok||!body.body) throw new Error("官方安装包下载失败。");
      const length=body.headers.get("content-length");
      if(length!==null&&Number(length)!==manifest.size) throw new Error("官方安装包大小不匹配。");
      for await(const chunk of body.body as unknown as AsyncIterable<Uint8Array>) {
        options.signal?.throwIfAborted();
        downloaded+=chunk.length;
        if(downloaded>Number(manifest.size)) throw new Error("官方安装包超出声明大小。");
        digest.update(chunk);
        let offset=0;
        while(offset<chunk.length) {const written=await file.write(chunk,offset,chunk.length-offset);if(written.bytesWritten===0)throw new Error("安装包缓存写入失败。");offset+=written.bytesWritten;}
        if(Date.now()-lastProgress>300){options.progress(`正在下载官方 ChatGPT 安装包… ${Math.floor(downloaded/Number(manifest.size)*100)}%`);lastProgress=Date.now();}
      }
      if(downloaded!==manifest.size||digest.digest("hex")!==manifest.sha256.toLowerCase()) throw new Error("官方安装包校验失败，请重新下载。");
      await file.sync();
    } finally {await file.close();}
    await rename(partial,archive);
    options.signal?.throwIfAborted();
    options.progress("官方安装包已校验，正在安装；请允许 Windows 管理员授权…");
    const script=offlineInstallScript(archive,workspace);
    options.installationStarted?.();
    const result=await options.execute("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(script,"utf16le").toString("base64")],{timeout:15*60*1000,windowsHide:true});
    const registered=JSON.parse(result.stdout.trim()) as {installed?:boolean};
    if(registered.installed!==true) throw new Error("官方客户端注册未完成。");
  } finally { await rm(workspace,{recursive:true,force:true}); }
}

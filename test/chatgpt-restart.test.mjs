import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chatGptStopScript, chatGptRestartCommand, chatGptLaunchCommand, chatGptRestartError} from '../dist-electron/chatgpt-restart.js';
const exec=promisify(execFile),powershell='C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
async function scenario(kind){
  const mock=`$global:alive=$true; $global:stopped=@(); $global:kind='${kind}'; function Get-CimInstance {param($ClassName)};
    $global:target=[pscustomobject]@{Id=14840;Path='C:\\Fixture\\ChatGPT.exe';HasExited=$false;StartTime=[datetime]'2026-01-01'};
    $target | Add-Member ScriptMethod CloseMainWindow { return $false };
    $global:bridge=[pscustomobject]@{Id=9999;Path='C:\\Fixture\\Bridge.exe';HasExited=$false;StartTime=[datetime]'2026-01-01'};
    $global:outside=[pscustomobject]@{Id=7777;Path='C:\\Other\\Codex.exe';HasExited=$false;StartTime=[datetime]'2026-01-01'};
    function Get-AppxPackage { param($Name) [pscustomobject]@{InstallLocation='C:\\Fixture'} }
    function Get-Process { [CmdletBinding()]param($Name,$Id)
      if($Name){return @($target,$bridge,$outside)};
      if($Id -eq 14840 -and $alive -and $kind -ne 'gone'){
        if($kind -eq 'reused'){return [pscustomobject]@{Id=14840;Path=$target.Path;HasExited=$false;StartTime=$target.StartTime.AddSeconds(1)}};
        return $target
      }
    }
    function Stop-Process { [CmdletBinding()]param($Id,[switch]$Force)
      $global:stopped+= $Id;
      if($kind -eq 'denied'){$PSCmdlet.ThrowTerminatingError([Management.Automation.ErrorRecord]::new([UnauthorizedAccessException]::new('access denied'),'PermissionDenied',[Management.Automation.ErrorCategory]::PermissionDenied,$Id))};
      $global:alive=$false;
      if($kind -eq 'race'){$PSCmdlet.ThrowTerminatingError([Management.Automation.ErrorRecord]::new([ArgumentException]::new('already exited'),'NoProcessFoundForGivenId',[Management.Automation.ErrorCategory]::ObjectNotFound,$Id))}
    };`;
  const {stdout}=await exec(powershell,['-NoProfile','-NonInteractive','-Command',mock+chatGptStopScript(9999,0)+"; [pscustomobject]@{stopped=@($stopped);bridgeAlive=$bridge.HasExited -eq $false} | ConvertTo-Json -Compress"],{windowsHide:true,timeout:10000});
  return JSON.parse(stdout);
}
test('handles a child exiting between lookup and force-stop',async()=>{assert.deepEqual(await scenario('race'),{stopped:[14840],bridgeAlive:true})});
test('ignores an already-exited process',async()=>{assert.deepEqual(await scenario('gone'),{stopped:[],bridgeAlive:true})});
test('preserves permission failures instead of masking them',async()=>{await assert.rejects(scenario('denied'),/access denied/)});
test('does not terminate a reused PID, Bridge, or another Codex installation',async()=>{assert.deepEqual(await scenario('reused'),{stopped:[],bridgeAlive:true})});

test('uses a validated official package-family fallback when Appx registration lookup fails',async()=>{
 const script=`$global:alive=$true; $global:stopped=@(); function Get-CimInstance {param($ClassName)}; function Get-AppxPackage { throw 'Appx unavailable' }; function Get-Process { param($Name,$Id); if($alive -and ($Name -or $Id -eq 14840)){$p=[pscustomobject]@{Id=14840;Path='C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe';StartTime=[datetime]'2026-01-01'};$p|Add-Member ScriptMethod CloseMainWindow {return $false};return $p} };function Stop-Process {param($Id,[switch]$Force);$global:stopped+=$Id;$global:alive=$false};`;
 const {stdout}=await exec(powershell,['-NoProfile','-NonInteractive','-Command',script+chatGptStopScript(9999,0,'OpenAI.Codex_2p2nqsd0c76g0!App')+'; ConvertTo-Json -InputObject @($stopped) -Compress'],{windowsHide:true,timeout:10000});
 assert.deepEqual(JSON.parse(stdout),[14840]);
 assert.throws(()=>chatGptStopScript(9999,0,"OpenAI.Codex_x';evil"),/Invalid official/);
});
test('restart uses encoded Unicode command and exposes actionable errors without full script',()=>{
 const args=chatGptRestartCommand(9999,'OpenAI.Codex_2p2nqsd0c76g0!App');assert.equal(args[2],'-EncodedCommand');assert.match(Buffer.from(args[3],'base64').toString('utf16le'),/RESTART_STOP_FAILED/);
 assert.match(chatGptRestartError({stderr:'{"detail":"Access is denied"}'}),/Windows/);
 assert.match(chatGptRestartError({killed:true}),/超时/);
 assert.match(chatGptRestartError({stderr:''}),/未返回错误详情/);
 assert.doesNotMatch(chatGptRestartError({message:'Command failed: private long script'}),/private long script/);
});

test('stops the official downloaded codex runtime only when it belongs to the package process tree',async()=>{
 const mock=`$global:stopped=@();$global:alive=@{14840=$true;20000=$true;30000=$true;9999=$true;40000=$true};
 function Get-AppxPackage {param($Name);[pscustomobject]@{InstallLocation='C:\\Fixture'}};
 function Get-CimInstance {param($ClassName);@([pscustomobject]@{ProcessId=14840;ParentProcessId=1},[pscustomobject]@{ProcessId=20000;ParentProcessId=14840},[pscustomobject]@{ProcessId=30000;ParentProcessId=42},[pscustomobject]@{ProcessId=9999;ParentProcessId=14840},[pscustomobject]@{ProcessId=40000;ParentProcessId=9999})};
 function Get-Process {param($Name,$Id);$ids=if($Name){@(14840,20000,30000,9999,40000)}else{@($Id)};foreach($item in $ids){if(-not $alive[[int]$item]){continue};$path=if($item -eq 14840){'C:\\Fixture\\ChatGPT.exe'}elseif($item -eq 9999){'C:\\Fixture\\Bridge.exe'}else{Join-Path $env:LOCALAPPDATA 'OpenAI\\Codex\\bin\\fixture\\codex.exe'};$p=[pscustomobject]@{Id=$item;Path=$path;StartTime=[datetime]'2026-01-01'};$p|Add-Member ScriptMethod CloseMainWindow {return $false};$p}};
 function Stop-Process {param($Id,[switch]$Force);$global:stopped+=$Id;$global:alive[[int]$Id]=$false};`;
 const {stdout}=await exec(powershell,['-NoProfile','-NonInteractive','-Command',mock+chatGptStopScript(9999,0)+";[pscustomobject]@{stopped=@($stopped);unrelated=$alive[30000];bridge=$alive[9999];bridgeChild=$alive[40000]}|ConvertTo-Json -Compress"],{windowsHide:true,timeout:10000});
 assert.deepEqual(JSON.parse(stdout),{stopped:[14840,20000],unrelated:true,bridge:true,bridgeChild:true});
});

test('launch uses validated AppID and requires a trusted package process to appear',async()=>{
 const command=chatGptLaunchCommand('OpenAI.Codex_2p2nqsd0c76g0!App'),script=Buffer.from(command[3],'base64').toString('utf16le');
 const mock=`$global:started=$false;function Get-AppxPackage {param($Name);[pscustomobject]@{InstallLocation='C:\\Fixture';PackageFamilyName='OpenAI.Codex_2p2nqsd0c76g0'}};function Start-Process {param($FilePath,$ArgumentList,$WindowStyle);if($FilePath -ne 'explorer.exe' -or $ArgumentList -ne 'shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App'){throw 'bad launch'};$global:started=$true};function Get-Process {param($Name);if($started){[pscustomobject]@{Path='C:\\Fixture\\ChatGPT.exe';HasExited=$false}}};`;
 const {stdout}=await exec(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(mock+script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});assert.deepEqual(JSON.parse(stdout),{ok:true});
 assert.throws(()=>chatGptLaunchCommand("OpenAI.Codex_x!App';bad"),/Invalid official/);
 const parser=`$errors=$null;$tokens=$null;[void][Management.Automation.Language.Parser]::ParseInput([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${command[3]}')),[ref]$tokens,[ref]$errors);if($errors.Count){throw 'PARSE_FAILED'};'PARSE_OK'`;
 assert.match((await exec(powershell,['-NoProfile','-NonInteractive','-Command',parser],{windowsHide:true,timeout:10000})).stdout,/PARSE_OK/);
});

test('force-stop rescans a trusted codex backend spawned while the GUI closes',async()=>{
 const mock=`$global:stopped=@();$global:alive=@{14840=$true;20000=$true};$global:scan=0;
 function Get-AppxPackage {param($Name);[pscustomobject]@{InstallLocation='C:\\Fixture'}};
 function Get-CimInstance {param($ClassName);$global:scan++;if($scan -ge 2){[pscustomobject]@{ProcessId=20000;ParentProcessId=14840}}};
 function Get-Process {param($Name,$Id);$ids=if($Name){@(14840)}else{@($Id)};foreach($item in $ids){if(-not $alive[[int]$item]){continue};$path=if($item -eq 14840){'C:\\Fixture\\ChatGPT.exe'}else{Join-Path $env:LOCALAPPDATA 'OpenAI\\Codex\\bin\\fixture\\codex.exe'};$p=[pscustomobject]@{Id=$item;Path=$path;StartTime=[datetime]'2026-01-01'};$p|Add-Member ScriptMethod CloseMainWindow {return $false};$p}};
 function Stop-Process {param($Id,[switch]$Force);$global:stopped+=$Id;$global:alive[[int]$Id]=$false};`;
 const {stdout}=await exec(powershell,['-NoProfile','-NonInteractive','-Command',mock+chatGptStopScript(9999,0)+';ConvertTo-Json -InputObject @($stopped) -Compress'],{windowsHide:true,timeout:10000});assert.deepEqual(JSON.parse(stdout),[14840,20000]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chatGptStopScript} from '../dist-electron/chatgpt-restart.js';
const exec=promisify(execFile),powershell='C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
async function scenario(kind){
  const mock=`$global:alive=$true; $global:stopped=@(); $global:kind='${kind}';
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

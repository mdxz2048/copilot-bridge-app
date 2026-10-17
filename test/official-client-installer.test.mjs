import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {installOfficialClient,offlineInstallScript} from '../dist-electron/official-client-installer.js';
import {ChatGptManager} from '../dist-electron/chatgpt-manager.js';
const exec=promisify(execFile),ps='C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const url='https://ai.mddxz.top/api/v1/official-client/files/ChatGPT-Windows-x64.zip';
const payload=Buffer.from('fixture installer'),manifest={arch:'x64',filename:'ChatGPT-Windows-x64.zip',downloadUrl:url,size:payload.length,sha256:createHash('sha256').update(payload).digest('hex')};
const fakeFetch=(changes={})=>async(input,options)=>{assert.equal(options.redirect,'error');return String(input).endsWith('/windows')?Response.json({...manifest,...changes}):new Response(payload,{headers:{'content-length':String(payload.length)}})};
const ownTemp=()=>mkdtemp(join(tmpdir(),'bridge-offline-test-'));
test('verified download invokes only local encoded installer then deletes own cache',async()=>{
 const directory=await ownTemp();let called=0;
 try{await installOfficialClient(directory,{fetch:fakeFetch(),progress:()=>{},execute:async(file,args)=>{called++;assert.equal(args[2],'-EncodedCommand');const script=Buffer.from(args[3],'base64').toString('utf16le');assert.match(script,/Get-AuthenticodeSignature/);assert.match(script,/-Verb RunAs/);assert.doesNotMatch(script,/-File.*Install-ChatGPT.ps1/);return{stdout:'{"installed":true}',stderr:''}}});assert.equal(called,1);assert.deepEqual(await readdir(directory),[]);}finally{await rm(directory,{recursive:true,force:true})}
});
test('untrusted URL, oversized manifest, hash and exact size mismatch cannot launch installer',async()=>{
 for(const changes of [{downloadUrl:'https://evil.invalid/x.zip'},{size:2**40},{sha256:'0'.repeat(64)},{size:payload.length+1}]){
  const directory=await ownTemp();let called=0;
  try{await assert.rejects(installOfficialClient(directory,{fetch:fakeFetch(changes),progress:()=>{},execute:async()=>{called++;return{stdout:'{}',stderr:''}}}));assert.equal(called,0);assert.deepEqual(await readdir(directory),[]);}finally{await rm(directory,{recursive:true,force:true})}
 }
});
test('aborted download cleans partial data and never invokes installer',async()=>{
 const directory=await ownTemp(),controller=new AbortController();let called=0;
 try{await assert.rejects(installOfficialClient(directory,{fetch:fakeFetch(),signal:controller.signal,progress:()=>controller.abort(),execute:async()=>{called++;return{stdout:'{}',stderr:''}}}));assert.equal(called,0);assert.deepEqual(await readdir(directory),[]);}finally{await rm(directory,{recursive:true,force:true})}
});

// These are real PowerShell/ZipArchive boundary checks. Every deployment/UAC cmdlet
// is overridden before evaluation; no Windows package can be installed by this test.
async function zipScenario(kind){
 const directory=await ownTemp(),archive=join(directory,'fixture.zip'),destination=join(directory,'extract');
 const q=v=>`'${v.replaceAll("'","''")}'`;
 const setup=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem
 New-Item -ItemType Directory -Path ${q(destination)} | Out-Null
 $msixPath=Join-Path ${q(directory)} 'fixture.msix';$msix=[IO.Compression.ZipFile]::Open($msixPath,'Create')
 $entry=$msix.CreateEntry('AppxManifest.xml');$writer=New-Object IO.StreamWriter($entry.Open());$writer.Write('<Package><Identity Name="OpenAI.Codex" ProcessorArchitecture="x64" Publisher="CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B" /></Package>');$writer.Dispose();$entry=$msix.CreateEntry('AppxSignature.p7x');$writer=New-Object IO.StreamWriter($entry.Open());$writer.Write('fixture');$writer.Dispose();$msix.Dispose()
 $zip=[IO.Compression.ZipFile]::Open(${q(archive)},'Create')
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$msixPath,'ChatGPT-x64.msix') | Out-Null
 foreach($name in @('ChatGPT-License.xml','Install-ChatGPT.ps1','Install-ChatGPT.cmd',${q(kind==='traversal'?'../README.txt':kind==='duplicate'?'Install-ChatGPT.cmd':'README.txt')})){$entry=$zip.CreateEntry($name);$writer=New-Object IO.StreamWriter($entry.Open());$writer.Write('fixture');$writer.Dispose()};$zip.Dispose()
 function Get-AuthenticodeSignature {param($LiteralPath) [pscustomobject]@{Status='${kind==='bad-signature'?'NotSigned':'Valid'}'}}
 function Start-Process {param($FilePath,$Verb,$ArgumentList,[switch]$Wait,[switch]$PassThru,$WindowStyle) [pscustomobject]@{ExitCode=0}}
 function Add-AppxPackage {param($Path,$ErrorAction)}
 function Get-AppxPackage {param($Name) [pscustomobject]@{PackageFamilyName='OpenAI.Codex_2p2nqsd0c76g0';Status=0;Version='1.2.3.4'}}
 `;
 try{return await exec(ps,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(setup+offlineInstallScript(archive,destination),'utf16le').toString('base64')],{windowsHide:true,timeout:15000})}finally{await rm(directory,{recursive:true,force:true})}
}
test('PowerShell ZIP extraction accepts only fixed files and package-signature guard is enforced',async()=>{
 assert.equal(JSON.parse((await zipScenario('valid')).stdout.trim()).installed,true);
 await assert.rejects(zipScenario('traversal'),/Unsafe ZIP entry/);
 await assert.rejects(zipScenario('duplicate'),/Unsafe ZIP entry/);
 await assert.rejects(zipScenario('bad-signature'),/signature is invalid/);
});
test('generated Unicode PowerShell installer parses without executing installation',async()=>{
 const encoded=Buffer.from(offlineInstallScript("C:/fixture/user's/包.zip","C:/fixture/user's/安装"),'utf16le').toString('base64');
 const source=`$source=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'));$tokens=$null;$errors=$null;[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)|Out-Null;ConvertTo-Json -InputObject @($errors) -Compress`;
 const {stdout}=await exec(ps,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});assert.equal(stdout.trim(),'[]');
});
test('manager requires real detection after offline installer reports success',async()=>{
 const directory=await ownTemp(),statuses=[];
 try{const manager=new ChatGptManager(undefined,{offlineFetch:fakeFetch(),execute:async()=>({stdout:'{"installed":true}',stderr:''})});manager.detect=async()=>({state:'NOT_INSTALLED',message:'missing'});await manager.installOffline(directory,s=>statuses.push(s));assert.equal(statuses.at(-1).state,'ERROR');assert.match(statuses.at(-1).message,/注册成功/);}finally{await rm(directory,{recursive:true,force:true})}
});
test('manager cannot pretend cancellation stopped elevated Windows deployment',async()=>{
 const directory=await ownTemp(),statuses=[];let manager;let detectCount=0;
 try{manager=new ChatGptManager(undefined,{offlineFetch:fakeFetch(),execute:async()=>{assert.equal(manager.cancelInstall(),false);assert.throws(()=>manager.install(()=>{},async()=>{}),/已在进行中/);return{stdout:'{"installed":true}',stderr:''}}});manager.detect=async()=>++detectCount===1?{state:'NOT_INSTALLED',message:'missing'}:{state:'INSTALLED',message:'installed'};await manager.installOffline(directory,s=>statuses.push(s));assert.equal(statuses.at(-1).state,'INSTALLED');assert.equal(manager.cancelInstall(),true);}finally{await rm(directory,{recursive:true,force:true})}
});


test('offline installer header/body stalls release waiting, clean cache and never execute installation',async()=>{
 for(const phase of ['manifest','body']){
  const dir=await ownTemp();let executed=false;
  try{await assert.rejects(installOfficialClient(dir,{networkTimeouts:{connectMs:25,idleMs:25,totalMs:250},progress:()=>{},execute:async()=>{executed=true;return{stdout:'{}',stderr:''};},fetch:async input=>String(input).endsWith('/windows')?(phase==='manifest'?new Promise(()=>{}):Response.json(manifest)):new Response(new ReadableStream({start(c){c.enqueue(payload.subarray(0,1));}}))}),/网络可能不稳定/);assert.equal(executed,false);assert.deepEqual(await readdir(dir),[]);}finally{await rm(dir,{recursive:true,force:true});}
 }
});

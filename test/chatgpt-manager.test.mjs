import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import { ChatGptManager } from '../dist-electron/chatgpt-manager.js';
import {prepareOfficialClientConnection,restartOfficialClientForProfile} from '../dist-electron/official-client-flow.js';
import {storeDownloadProgress} from '../dist-electron/store-install-progress.js';
const installed={state:'INSTALLED',message:'installed',appId:'OpenAI.Codex_2p2nqsd0c76g0!App'};
class Child extends EventEmitter {stdout=new EventEmitter();stderr=new EventEmitter();exitCode=null;killed=false;kill(){this.killed=true;}}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));

test('each verified local detection channel independently establishes installation',async()=>{
 const name='OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0';
 for(const fixture of [
  {package:{PackageFullName:name,PackageFamilyName:'OpenAI.Codex_2p2nqsd0c76g0',Version:'26.1007.2314.0',Status:0}},
  {registered:name,registeredUsable:true},
  {package:{PackageFullName:name,Status:1},registered:name,registeredUsable:true},
  {directoryPackage:name},
  {runningPackage:name},
 ]){
  const manager=new ChatGptManager(undefined,{execute:async()=>({stdout:JSON.stringify(fixture),stderr:''})});
  const status=await manager.detect();assert.equal(status.state,'INSTALLED');assert.equal(status.appId,installed.appId);
 }
});

test('real PowerShell directory probe requires the official manifest and executable, independently of Appx and shortcuts',{skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'bridge-detection-'));
 const packageRoot=join(root,'WindowsApps','OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0');
 const manifest=join(packageRoot,'AppxManifest.xml');
 await mkdir(join(packageRoot,'app'),{recursive:true});
 await writeFile(join(packageRoot,'app','ChatGPT.exe'),'fixture');
 const xml=publisher=>`<Package><Identity Name="OpenAI.Codex" ProcessorArchitecture="x64" Publisher="${publisher}" /></Package>`;
 const prefix=`$env:ProgramFiles='${root.replaceAll("'","''")}';function Get-AppxPackage {throw 'Appx unavailable'};function Get-StartApps {};function Get-Process {};function Get-ChildItem {param($Path,$LiteralPath,[switch]$Directory,$Filter,$ErrorAction);if($Path -like 'Registry::*'){return};Microsoft.PowerShell.Management\\Get-ChildItem -LiteralPath $LiteralPath -Directory -Filter $Filter};`;
 const manager=new ChatGptManager(undefined,{execute:async(file,args,options)=>promisify(execFile)(file,[...args.slice(0,3),prefix+args[3]],{...options,encoding:'utf8'})});
 try{
  await writeFile(manifest,xml('CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B'));
  assert.equal((await manager.detect()).state,'INSTALLED');
  await writeFile(manifest,xml('CN=Other publisher'));
  assert.equal((await manager.detect()).state,'NOT_INSTALLED');
  await rm(join(packageRoot,'app','ChatGPT.exe'));await writeFile(manifest,xml('CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B'));
  assert.equal((await manager.detect()).state,'NOT_INSTALLED');
 }finally{
  assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});
 }
});

test('healthy registered files and official StartApps identity do not depend on winget or Store connectivity',async()=>{
 const calls=[];
 const manager=new ChatGptManager(undefined,{execute:async(file,args)=>{
  calls.push(file);assert.match(args[3],/Test-Path/);
  return {stdout:JSON.stringify({package:null,app:{AppID:installed.appId},registered:'OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0',registeredUsable:true}),stderr:''};
 }});
 assert.equal((await manager.detect()).state,'INSTALLED');assert.equal(calls.length,1);
});

test('stale shortcuts, missing files and damaged packages never count as installed',async()=>{
 for(const fixture of [
  {app:{AppID:installed.appId},registered:'OpenAI.Codex_1.2.3.4_x64__2p2nqsd0c76g0',registeredUsable:false},
  {app:{AppID:'Other.App!App'},registered:'Other.App_1.2.3.4_x64__other',registeredUsable:true},
  {package:{PackageFullName:'OpenAI.Codex_1.2.3.4_x64__2p2nqsd0c76g0',Status:1},app:{AppID:installed.appId},registered:'OpenAI.Codex_1.2.3.4_x64__2p2nqsd0c76g0',registeredUsable:false},
 ]){
  const manager=new ChatGptManager(undefined,{execute:async()=>({stdout:JSON.stringify(fixture),stderr:''})});
  assert.equal((await manager.detect()).state,'NOT_INSTALLED');
 }
});

test('refresh survives Store watcher expiry and download cancellation',async()=>{
 const child=new Child(),statuses=[];
 const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child,installationAttempts:0});
 let result={state:'NOT_INSTALLED',message:'missing'};manager.detect=async()=>result;
 manager.install(s=>statuses.push(s),async()=>{});child.emit('exit',1);await tick();
 assert.equal(statuses.at(-1).state,'ERROR');manager.cancelInstall();result=installed;
 assert.equal((await manager.refreshStatus(s=>statuses.push(s))).state,'INSTALLED');
 assert.equal(statuses.at(-1).state,'INSTALLED');
});

test('late Store exit detection cannot replace a successful independent refresh',async()=>{
 const child=new Child(),statuses=[];let finishExit;const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child});
 manager.detect=()=>new Promise(resolve=>{finishExit=resolve});
 manager.install(s=>statuses.push(s),async()=>{});child.emit('exit',1);
 manager.detect=async()=>installed;await manager.refreshStatus(s=>statuses.push(s));
 finishExit({state:'NOT_INSTALLED',message:'old detection'});await tick();
 assert.equal(statuses.at(-1).state,'INSTALLED');assert.equal(statuses.filter(s=>s.state==='INSTALLED').length,1);
});

test('late offline failure cannot overwrite Store success and the redundant download is aborted',async()=>{
 let failFetch,downloadSignal;const statuses=[];
 const manager=new ChatGptManager(undefined,{offlineFetch:async(_url,options)=>{
  downloadSignal=options.signal;return new Promise((_resolve,reject)=>{failFetch=reject});
 }});
 manager.detect=async()=>({state:'NOT_INSTALLED',message:'missing'});
 const pending=manager.installOffline('unused-fixture',s=>statuses.push(s));await tick();
 manager.detect=async()=>installed;await manager.refreshStatus(s=>statuses.push(s));
 assert.equal(downloadSignal.aborted,true);failFetch(Error('cancelled download'));await pending;
 assert.equal(statuses.at(-1).state,'INSTALLED');assert.equal(statuses.some(s=>s.state==='ERROR'),false);
});

test('concurrent installation checks share a single detector and preserve active download progress',async()=>{
 let detected=0,finish;const manager=new ChatGptManager();
 manager.detect=()=>{detected++;return new Promise(resolve=>{finish=resolve})};
 const a=manager.refreshStatus(),b=manager.refreshStatus();finish(installed);
 assert.equal((await a).state,'INSTALLED');assert.equal((await b).state,'INSTALLED');assert.equal(detected,1);
});
test('stop failure preserves Bridge and never launches another official client',async()=>{
 const calls=[];const manager=new ChatGptManager(undefined,{execute:async(file,args)=>{calls.push({file,args});throw {stderr:'{"detail":"Access is denied"}'};}});manager.detect=async()=>installed;let launched=0;manager.launch=async()=>{launched++};
 await assert.rejects(manager.restart(),/Windows 拒绝/);assert.equal(launched,0);assert.equal(calls.length,1);assert.equal(calls[0].args[2],'-EncodedCommand');
});
test('successful stop launches only after completion',async()=>{
 const sequence=[];const manager=new ChatGptManager(undefined,{execute:async()=>{sequence.push('stop');return{stdout:'{"ok":true}',stderr:''}}});manager.detect=async()=>installed;manager.launch=async()=>{sequence.push('launch')};await manager.restart();assert.deepEqual(sequence,['stop','launch']);
});
test('missing winget and unavailable Store open the fixed official download fallback',async()=>{
 const child=new Child(),statuses=[];let downloaded=0;const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child});
 manager.install(status=>statuses.push(status),async()=>{throw Error('Store disabled')},async()=>{downloaded++});child.emit('error',new Error('winget missing'));await tick();
 assert.equal(downloaded,1);assert.equal(statuses.at(-1).state,'ERROR');assert.equal(statuses.at(-1).downloadAvailable,true);assert.equal(ChatGptManager.downloadPageUri(),'https://ai.mddxz.top/download#chatgpt');assert.equal(child.stdout.listenerCount('data'),1);assert.equal(child.stderr.listenerCount('data'),1);
});
test('Store registration timeout offers offline download and permits retry',async()=>{
 const child=new Child(),statuses=[];let downloaded=0;const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child,installationAttempts:0});manager.detect=async()=>({state:'NOT_INSTALLED',message:'missing'});
 manager.install(status=>statuses.push(status),async()=>{},async()=>{downloaded++});child.emit('exit',1);await tick();assert.equal(downloaded,1);assert.equal(statuses.at(-1).state,'ERROR');assert.ok(statuses.some(s=>s.step==='WAITING_FOR_STORE'&&s.downloadAvailable));manager.cancelInstall();
});
test('cancelled Store watcher cannot overwrite the cancellation state or open download',async()=>{
 const child=new Child(),statuses=[];let downloaded=0;const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child,installationPollMs:30,installationAttempts:1});manager.detect=async()=>({state:'NOT_INSTALLED',message:'missing'});
 manager.install(status=>statuses.push(status),async()=>{},async()=>{downloaded++});child.emit('exit',1);await tick();manager.cancelInstall();const count=statuses.length;await new Promise(resolve=>setTimeout(resolve,40));assert.equal(statuses.length,count);assert.equal(downloaded,0);
});

test('startup missing installation starts automatically once and cancellation never reopens it',async()=>{
 const manager=new ChatGptManager();let installedCount=0;
 manager.detect=async()=>({state:'NOT_INSTALLED',message:'missing'});manager.install=()=>{installedCount++};
 await Promise.all([manager.ensureInstalledOnOpen(()=>{},async()=>{}),manager.ensureInstalledOnOpen(()=>{},async()=>{})]);
 manager.cancelInstall();await manager.ensureInstalledOnOpen(()=>{},async()=>{});assert.equal(installedCount,1);
});

test('startup already installed or inconclusive detection never launches an installer',async()=>{
 for(const status of [installed,{state:'ERROR',message:'cannot detect'}]){
  const manager=new ChatGptManager();let installedCount=0;manager.detect=async()=>status;manager.install=()=>{installedCount++};
  await manager.ensureInstalledOnOpen(()=>{},async()=>{});assert.equal(installedCount,0);
 }
});

test('a user action while startup detection is pending suppresses the stale automatic install',async()=>{
 let resolveDetect,installedCount=0;const manager=new ChatGptManager();
 manager.detect=()=>new Promise(resolve=>{resolveDetect=resolve});manager.install=()=>{installedCount++};
 const pending=manager.ensureInstalledOnOpen(()=>{},async()=>{});manager.cancelInstall();
 resolveDetect({state:'NOT_INSTALLED',message:'old missing'});await pending;assert.equal(installedCount,0);
});

test('Store unavailable automatically invokes real offline path rather than opening a website',async()=>{
 const child=new Child(),states=[];let directory,website=0;
 const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child,offlineDirectory:'C:/own/offline'});
 manager.installOffline=async(path,notify)=>{directory=path;notify(installed)};
 manager.install(status=>states.push(status),async()=>{throw Error('should not open Store page')},async()=>{website++});
 child.emit('error',new Error('winget missing'));await tick();
 assert.equal(directory,'C:/own/offline');assert.equal(website,0);assert.equal(states.at(-1).state,'INSTALLED');
});

test('no Store download progress triggers offline only after installer process exits',async()=>{
 const child=new Child(),order=[];child.kill=()=>{order.push('kill');setTimeout(()=>{child.exitCode=1;order.push('exit');child.emit('exit',1)},10);return true;};
 const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child,offlineDirectory:'C:/own/offline',storeStartTimeoutMs:10});
 manager.detect=async()=>({state:'NOT_INSTALLED',message:'missing'});
 manager.installOffline=async()=>{order.push('offline')};manager.install(()=>{},async()=>{});
 child.stdout.emit('data',Buffer.from('Initializing Microsoft Store source'));
 await new Promise(resolve=>setTimeout(resolve,50));assert.deepEqual(order,['kill','exit','offline']);
});

test('active Store byte progress is not mistaken for a download that never began',async()=>{
 const child=new Child();let offline=0;const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child,offlineDirectory:'C:/own/offline',storeStartTimeoutMs:10,installerTimeoutMs:500,installationPollMs:10});
 manager.detect=async()=>({state:'NOT_INSTALLED',message:'missing'});manager.installOffline=async()=>{offline++};manager.install(()=>{},async()=>{});
 child.stderr.emit('data',Buffer.from('Downloading 12.5 MB / 800 MB'));
 await new Promise(resolve=>setTimeout(resolve,35));assert.equal(child.killed,false);assert.equal(offline,0);manager.cancelInstall();
});

test('Store progress requires nonzero bytes downloaded or percentage, not total size or source initialization',()=>{
 assert.equal(storeDownloadProgress('0%'),null);assert.equal(storeDownloadProgress('0 MB / 944 MB'),null);assert.equal(storeDownloadProgress('Package size 944 MB'),null);assert.equal(storeDownloadProgress('Updating source 100%'),null);
 assert.equal(storeDownloadProgress('12.5 MB / 100 MB'),.125);assert.equal(storeDownloadProgress('Downloading 2%'),.02);assert.equal(storeDownloadProgress('512 KB / 1 MB'),.5);
});

test('zero-byte Store progress does not suppress automatic offline fallback',async()=>{
 const child=new Child();child.kill=()=>{child.exitCode=1;child.emit('exit',1);return true};let offline=0;
 const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child,offlineDirectory:'C:/own/offline',storeStartTimeoutMs:10});manager.detect=async()=>({state:'NOT_INSTALLED',message:'missing'});manager.installOffline=async()=>{offline++};manager.install(()=>{},async()=>{});child.stdout.emit('data',Buffer.from('0 MB / 944 MB 0%'));
 await new Promise(resolve=>setTimeout(resolve,35));assert.equal(offline,1);
});

test('fallback waits for an isolated real installer subprocess to exit before offline handoff',async()=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'pipe'});let offline=0;
 const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child,offlineDirectory:'C:/own/offline',storeStartTimeoutMs:15});manager.detect=async()=>({state:'NOT_INSTALLED',message:'missing'});
 let done;const completed=new Promise(resolve=>{done=resolve});manager.installOffline=async()=>{assert.ok(child.exitCode!==null||child.signalCode!==null,'real child must exit before deployment');offline++;done()};
 try{manager.install(()=>{},async()=>{});await Promise.race([completed,new Promise((_,reject)=>setTimeout(()=>reject(Error('handoff timeout')),1500))]);assert.equal(offline,1);}finally{if(child.exitCode===null&&child.signalCode===null)child.kill();manager.cancelInstall();}
});

test('installed package found at timeout completes without duplicate offline deployment',async()=>{
 const child=new Child();child.kill=()=>{child.exitCode=0;child.emit('exit',0);return true};let offline=0;const states=[];
 const manager=new ChatGptManager(undefined,{spawnInstaller:()=>child,offlineDirectory:'C:/own/offline',storeStartTimeoutMs:10});manager.detect=async()=>installed;manager.installOffline=async()=>{offline++};manager.install(status=>states.push(status),async()=>{});
 await new Promise(resolve=>setTimeout(resolve,35));assert.equal(offline,0);assert.equal(states.at(-1).state,'INSTALLED');
});

test('launch failure remains a failed restart after old processes exit',async()=>{
 let calls=0;const manager=new ChatGptManager(undefined,{execute:async(file,args)=>{calls++;const script=Buffer.from(args[3],'base64').toString('utf16le');if(script.includes('RESTART_LAUNCH_TIMEOUT'))throw{stderr:'{"detail":"RESTART_LAUNCH_TIMEOUT"}'};return{stdout:'{"ok":true}',stderr:''}}});manager.detect=async()=>installed;
 await assert.rejects(manager.restart(),/尚未确认新客户端启动/);assert.equal(calls,2);
});

test('Bridge readiness is checked before closing ChatGPT and success alone acknowledges profile',async()=>{
 const order=[];const prepare=()=>prepareOfficialClientConnection({getProfile:async()=>({activeProfile:'bridge'}),startBridge:async()=>{order.push('ready');return{state:'ready',message:'ok'}}});
 const status=await restartOfficialClientForProfile({prepare,restart:async()=>{order.push('restart')},acknowledge:async()=>{order.push('ack');return 'completed'}});
 assert.equal(status,'completed');assert.deepEqual(order,['ready','restart','ack']);
 order.length=0;await assert.rejects(restartOfficialClientForProfile({prepare:()=>prepareOfficialClientConnection({getProfile:async()=>({activeProfile:'bridge'}),startBridge:async()=>({state:'error',message:'unavailable'})}),restart:async()=>{order.push('restart')},acknowledge:async()=>{order.push('ack')}}),/Bridge 尚未就绪/);assert.deepEqual(order,[]);
 await assert.rejects(restartOfficialClientForProfile({prepare,restart:async()=>{throw Error('not started')},acknowledge:async()=>{order.push('ack')}}),/not started/);assert.deepEqual(order,['ready']);
 let started=false;await prepareOfficialClientConnection({getProfile:async()=>({activeProfile:'original'}),startBridge:async()=>{started=true;return{state:'error',message:''}}});assert.equal(started,false);
});

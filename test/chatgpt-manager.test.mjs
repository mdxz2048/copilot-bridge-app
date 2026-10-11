import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {spawn} from 'node:child_process';
import { ChatGptManager } from '../dist-electron/chatgpt-manager.js';
import {prepareOfficialClientConnection,restartOfficialClientForProfile} from '../dist-electron/official-client-flow.js';
import {storeDownloadProgress} from '../dist-electron/store-install-progress.js';
const installed={state:'INSTALLED',message:'installed',appId:'OpenAI.Codex_2p2nqsd0c76g0!App'};
class Child extends EventEmitter {stdout=new EventEmitter();stderr=new EventEmitter();exitCode=null;killed=false;kill(){this.killed=true;}}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
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

test('startup automatic installation is once per launch including cancellation and reopening',async()=>{
 const manager=new ChatGptManager();let detected=0,installedCount=0;
 manager.detect=async()=>{detected++;return{state:'NOT_INSTALLED',message:'missing'}};
 manager.install=()=>{installedCount++};
 await Promise.all([manager.ensureInstalledOnOpen(()=>{},async()=>{}),manager.ensureInstalledOnOpen(()=>{},async()=>{})]);
 manager.cancelInstall();await manager.ensureInstalledOnOpen(()=>{},async()=>{});
 assert.equal(detected,1);assert.equal(installedCount,1);
});

test('cancellation while startup detection is pending suppresses automatic installation',async()=>{
 const manager=new ChatGptManager();let resolveDetect,installedCount=0;manager.detect=()=>new Promise(resolve=>{resolveDetect=resolve});manager.install=()=>{installedCount++};
 const pending=manager.ensureInstalledOnOpen(()=>{},async()=>{});manager.cancelInstall();resolveDetect({state:'NOT_INSTALLED',message:'missing'});await pending;assert.equal(installedCount,0);
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

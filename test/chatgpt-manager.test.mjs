import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ChatGptManager } from '../dist-electron/chatgpt-manager.js';
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

import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
const source=await readFile(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8');
function fixture(request){let api;const module={exports:{}};new Function('require','module','exports','setTimeout','clearTimeout',source)(()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{api=value;}},ipcRenderer:{invoke:request,on(){},removeListener(){}}}),module,module.exports,setTimeout,clearTimeout);return api;}
test('IPC timeout releases a read with actionable feedback instead of leaving the renderer pending',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const api=fixture(()=>new Promise(()=>{}));const p=assert.rejects(api.getModels(),/获取模型列表等待超时.*网络/);await Promise.resolve();t.mock.timers.tick(25001);await p;
});
test('timed out mutations cannot be duplicated until the real operation settles',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release,calls=0;const api=fixture(()=>{calls++;return new Promise(r=>{release=r;});});const first=assert.rejects(api.loginCloud({email:'fixture@example.test',password:'PRIVATE_PASSWORD'}),e=>/操作结果可能已生效/.test(e.message)&&!e.message.includes('PRIVATE'));await Promise.resolve();t.mock.timers.tick(60001);await first;await assert.rejects(api.loginCloud({}),/仍在处理中/);assert.equal(calls,1);release({});await Promise.resolve();await Promise.resolve();await Promise.resolve();
});


test('credential helper kills only its own stalled child and reports a safe local timeout',async t=>{
 const{transform}=await import('esbuild');const{EventEmitter}=await import('node:events');
 const raw=await readFile(new URL('../dist-electron/cloud/windows-credential-manager.js',import.meta.url),'utf8');const{code}=await transform(raw,{format:'cjs'});
 t.mock.timers.enable({apis:['setTimeout']});let killed=false;
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdout.setEncoding=child.stderr.setEncoding=()=>{};child.stdin=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>{killed=true;};
 const module={exports:{}};new Function('require','module','exports','setTimeout','clearTimeout',code)(()=>({spawn:()=>child}),module,module.exports,setTimeout,clearTimeout);
 const manager=new module.exports.WindowsPasswordVaultCredentialManager();const p=assert.rejects(manager.read('synthetic-fixture'),/登录凭据等待超时/);t.mock.timers.tick(15001);await p;assert.equal(killed,true);child.emit('exit',1);
});

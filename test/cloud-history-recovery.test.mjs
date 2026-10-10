import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RemoteBridgeServer} from '../dist-electron/cloud/remote-bridge-server.js';
import {BridgeTrace} from '../dist-electron/cloud/bridge-trace.js';
import {ConversationCache} from '../dist-electron/cloud/conversation-cache.js';
const call={type:'function_call',call_id:'recover-call',name:'read_file',arguments:'{}'};
const result=(output=[])=>({id:'resp_history',object:'response',status:'completed',model:'test',output,usage:{input_tokens:1,output_tokens:1,total_tokens:2}});
const history=[{role:'user',content:'Read document'},call,{type:'function_call_output',call_id:call.call_id,output:'Document contents'}];
async function setup(handler){const bridge=new RemoteBridgeServer({getMe:async()=>({}),createResponse:handler},0);const status=await bridge.start();const post=input=>fetch(status.endpoint+'/v1/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'test',input,stream:false})});return{bridge,post};}
test('restores a self-contained tool history after Bridge restart',async()=>{
  const requests=[];const {bridge,post}=await setup(async(request,options)=>{requests.push({request,options});return{contentType:'application/json',response:Response.json(result())}});
  try{const response=await post(history);assert.equal(response.status,200);assert.deepEqual(requests[0].request.input,history);assert.equal((await post([...history,{role:'user',content:'Now summarize'}])).status,200);assert.equal(requests[0].options.threadId,requests[1].options.threadId);}finally{await bridge.stop()}
});
test('retries a consumed tool output after transient Cloud failure',async()=>{
  let count=0;const requests=[];const {bridge,post}=await setup(async(request,options)=>{requests.push({request:structuredClone(request),options});count++;if(count===2)throw Error('transient');return{contentType:'application/json',response:Response.json(result(count===1?[call]:[]))}});
  try{assert.equal((await post('read')).status,200);const output=[history[2]];assert.equal((await post(output)).status,500);assert.equal((await post(output)).status,200);assert.equal(requests[0].options.threadId,requests[2].options.threadId);assert.equal(requests[2].request.input.filter(i=>i.type==='function_call_output').length,1);}finally{await bridge.stop()}
});
test('rejects orphan and changed historical outputs',async()=>{
  const {bridge,post}=await setup(async()=>({contentType:'application/json',response:Response.json(result())}));
  try{assert.equal((await post(history)).status,200);assert.equal((await post([history[0],{...call,call_id:'other'},history[2]])).status,400);assert.equal((await post([history[0],call,{...history[2],output:'tampered'}])).status,400);}finally{await bridge.stop()}
});
test('encrypted account-scoped cache restores output-only continuations after restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bridge-cache-'));
  const codec={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^170),decryptString:b=>Buffer.from(b.map(v=>v^170)).toString()};
  const cache=new ConversationCache(join(dir,'state.enc'),codec);const threads=[];
  const client={getMe:async()=>({id:'account-A'}),createResponse:async(request,options)=>{threads.push(options.threadId);return{contentType:'application/json',response:Response.json(result(threads.length===1?[call]:[]))}}};
  const first=new RemoteBridgeServer(client,0,undefined,undefined,undefined,{getApiKey:async()=> 'test',cache});
  let second;
  const post=(endpoint,input)=>fetch(endpoint+'/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test'},body:JSON.stringify({model:'test',input,stream:false})});
  try{const one=await first.start();assert.equal((await post(one.endpoint,'read')).status,200);await first.stop();assert.equal(cache.load('account-B').length,0);assert.doesNotMatch((await readFile(cache.path)).toString(),/recover-call/);second=new RemoteBridgeServer(client,0,undefined,undefined,undefined,{getApiKey:async()=> 'test',cache});const two=await second.start();assert.equal((await post(two.endpoint,[history[2]])).status,200);assert.equal(threads[0],threads[1]);}finally{await first.stop();await second?.stop();await rm(dir,{recursive:true,force:true});}
});
test('captures authorized diagnostic bodies, redacts keys, rotates and expires body capture',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bridge-trace-'));try{const trace=new BridgeTrace(dir);await writeFile(join(dir,'capture.json'),JSON.stringify({captureBodies:true,expiresAt:new Date(Date.now()+60000).toISOString()}));await writeFile(join(dir,'requests.jsonl'),'x'.repeat(10*1024*1024));trace.write('request','id',{}, {input:'doc sk-123456789abcdef',apiKey:'secret',password:'password'});let text=await readFile(join(dir,'requests.jsonl'),'utf8');assert.match(text,/doc/);assert.doesNotMatch(text,/sk-123|"secret"|"password":"password"/);assert.equal((await readFile(join(dir,'requests.jsonl.1'),'utf8')).length,10*1024*1024);await writeFile(join(dir,'capture.json'),JSON.stringify({captureBodies:true,expiresAt:'2000-01-01'}));trace.write('request','expired',{},'PRIVATE_DOC');text=await readFile(join(dir,'requests.jsonl'),'utf8');assert.doesNotMatch(text,/PRIVATE_DOC/);}finally{await rm(dir,{recursive:true,force:true})}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpCloudClient} from '../dist-electron/cloud/http-cloud-client.js';
import {FailureCapture} from '../dist-electron/cloud/failure-feedback.js';

function client(fetch,overrides={}) {
  return new HttpCloudClient({baseUrl:'https://cloud.example.test',tokens:{getAccessToken:()=> 'test-token'},devices:{get:async()=>({deviceId:'11111111-1111-4111-8111-111111111111'})},deviceKeys:{get:async()=>({sign:()=>new Headers()})},fetch,...overrides});
}
test('model responses use their long deadline while control API keeps its short deadline',async t=>{
  const deadlines=[];
  t.mock.method(AbortSignal,'timeout',ms=>{deadlines.push(ms);return new AbortController().signal;});
  const api=client(async url=>url.endsWith('/v1/responses')?new Response('data: {}\n\n',{headers:{'content-type':'text/event-stream'}}):Response.json({minimumVersion:'0.3.1',latestVersion:'0.3.1',maintenance:false,features:{cloudGateway:true}}));
  await api.getClientConfig();await api.createResponse({model:'deepseek/test',input:'test',stream:true},{threadId:'test-thread'});
  assert.deepEqual(deadlines,[15000,70*60000]);
});

test('network feedback keeps safe nested cause codes without raw endpoints or secrets',async()=>{
 for(const code of ['ECONNRESET','ENOTFOUND','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED']){
  let calls=0;const api=client(async()=>{calls++;throw new TypeError('fetch failed',{cause:Object.assign(new Error('https://private.invalid?token=PRIVATE_SECRET'),{code,address:'PRIVATE_ADDRESS'})});});
  await assert.rejects(api.createResponse({model:'deepseek/test',input:'test',stream:true},{threadId:'fixture'}),error=>{
   const capture=new FailureCapture('11111111-1111-4111-8111-111111111111','0.3.17','11111111-1111-4111-8111-111111111112');
   const report=capture.failure('cloud_transport',error);assert.match(report.error.message,new RegExp(code));assert.match(report.error.message,/before_headers/);assert.doesNotMatch(JSON.stringify(report),/PRIVATE_|private.invalid/);return error.code==='SERVER_UNREACHABLE';
  });assert.equal(calls,1);
 }
});

test('a model deadline is distinguished from caller cancellation',async()=>{
 for(const caller of [false,true]){const controller=new AbortController(),api=client(async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),{responseTimeoutMs:15});
  const pending=api.createResponse({model:'deepseek/test',input:'test',stream:true},{threadId:'fixture',...(caller?{signal:controller.signal}:{})});const keepAlive=setTimeout(()=>{},100);
  if(caller)setTimeout(()=>controller.abort(),5);await assert.rejects(pending,error=>error.code==='SERVER_UNREACHABLE'&&error.message.includes(caller?'CALLER_CANCELLED':'REQUEST_DEADLINE'));clearTimeout(keepAlive);
 }
});
test('caller cancellation still stops a long model request and never replays the POST',async()=>{
  let calls=0;const controller=new AbortController();
  const api=client(async(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});});
  const pending=api.createResponse({model:'deepseek/test',input:'test',stream:true},{threadId:'test-thread',signal:controller.signal});
  setTimeout(()=>controller.abort(),5);
  await assert.rejects(pending,error=>error.code==='SERVER_UNREACHABLE');assert.equal(calls,1);
});


test('control API bounds both header wait and a stalled JSON body with a Chinese retry message',async()=>{
 for(const body of [false,true]){
  let signal;
  const api=client(async(_url,init)=>{signal=init.signal;return body?new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}})):new Promise(()=>{});},{timeoutMs:20});
  await assert.rejects(api.getClientConfig(),error=>error.code==='SERVER_UNREACHABLE'&&/网络可能不稳定/.test(error.message));
  assert.equal(signal.aborted,true);
 }
});

test('invalid JSON and interrupted response bodies provide distinct safe feedback',async()=>{
 const malformed=client(async()=>new Response('{'));await assert.rejects(malformed.getClientConfig(),e=>e.code==='INVALID_SERVER_RESPONSE'&&/响应不完整/.test(e.message));
 const broken=client(async()=>new Response(new ReadableStream({start(c){c.error(new TypeError('PRIVATE_ENDPOINT'));}})));await assert.rejects(broken.getClientConfig(),e=>e.code==='SERVER_UNREACHABLE'&&/网络可能不稳定/.test(e.message)&&!e.message.includes('PRIVATE'));
});

test('revoked refresh stops polling the server and clears local authentication once',async()=>{
 let calls=0,cleared=0;const tokens={getAccessToken:()=>cleared?null:'expired',readRefreshToken:async()=>cleared?null:'refresh-fixture',clear:async()=>{cleared++;}};
 const api=client(async url=>{calls++;return Response.json({error:{code:url.endsWith('/refresh')?'UNAUTHORIZED':'TOKEN_EXPIRED',message:'fixture',requestId:'11111111-1111-4111-8111-111111111111'}},{status:401});},{tokens});
 await assert.rejects(api.listModels(),e=>e.code==='UNAUTHORIZED');const before=calls;await assert.rejects(api.listModels(),e=>e.code==='UNAUTHORIZED');await assert.rejects(api.refresh(),e=>e.code==='UNAUTHORIZED');assert.equal(calls,before);assert.equal(cleared,1);
});

test('temporary refresh failure backs off without discarding credentials or repeated metadata requests',async()=>{
 let calls=0,cleared=0;const tokens={getAccessToken:()=> 'expired',readRefreshToken:async()=> 'fixture',clear:async()=>{cleared++;}};
 const api=client(async url=>{calls++;return Response.json({error:{code:url.endsWith('/refresh')?'RATE_LIMITED':'TOKEN_EXPIRED',message:'fixture',requestId:'11111111-1111-4111-8111-111111111111'}},{status:url.endsWith('/refresh')?429:401});},{tokens});
 await assert.rejects(api.listModels(),e=>e.code==='RATE_LIMITED');const before=calls;await assert.rejects(api.listModels(),e=>e.code==='SERVER_UNREACHABLE');assert.equal(calls,before);assert.equal(cleared,0);
});

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
  assert.deepEqual(deadlines,[30000,70*60000]);
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

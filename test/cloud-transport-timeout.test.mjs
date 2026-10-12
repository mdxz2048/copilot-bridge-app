import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpCloudClient} from '../dist-electron/cloud/http-cloud-client.js';

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
test('caller cancellation still stops a long model request and never replays the POST',async()=>{
  let calls=0;const controller=new AbortController();
  const api=client(async(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});});
  const pending=api.createResponse({model:'deepseek/test',input:'test',stream:true},{threadId:'test-thread',signal:controller.signal});
  setTimeout(()=>controller.abort(),5);
  await assert.rejects(pending,error=>error.code==='SERVER_UNREACHABLE');assert.equal(calls,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpCloudClient} from '../dist-electron/cloud/http-cloud-client.js';
const id='11111111-1111-4111-8111-111111111111',date=new Date().toISOString();
const input={clientId:id,kind:'FEATURE',title:'按设备筛选',content:'希望能够按设备筛选扣费。'};
function client(fetch,tokens={getAccessToken:()=> 'fixture-token'}){return new HttpCloudClient({baseUrl:'https://cloud.example.test',tokens,devices:{get:async()=>({deviceId:id})},deviceKeys:{get:async()=>({sign:()=>new Headers({DPoP:'fixture-proof'})})},fetch});}
test('account bills and feedback use signed owner routes without caller-provided identity',async()=>{
  const requests=[];
  const api=client(async(url,init)=>{requests.push({url,init});return Response.json(url.includes('/bills')?{data:[],pending:[],total:0,page:2,pageSize:20,summary:{balance:1,totalAdded:1,totalConsumed:0}}:init.method==='POST'?{feedback:{id,kind:'FEATURE',status:'OPEN',title:input.title,content:input.content,createdAt:date,updatedAt:date}}:{data:[],total:0,page:1,pageSize:20});});
  await api.listBills(2,'consumption');await api.listFeedback(1);await api.submitFeedback(input);
  assert.ok(requests[0].url.endsWith('/api/v1/me/bills?page=2&kind=consumption&pageSize=20'));
  for(const {init}of requests){assert.equal(init.headers.get('authorization'),'Bearer fixture-token');assert.equal(init.headers.get('dpop'),'fixture-proof');}
  assert.deepEqual(JSON.parse(requests[2].init.body),input);
  assert.throws(()=>api.listBills(0,'all'));assert.throws(()=>api.listBills(1,'other'));
  assert.throws(()=>api.submitFeedback({...input,userId:id}));assert.equal(requests.length,3);
});
test('signed account features reject logged-out access without sending a request',async()=>{
  let calls=0;const api=client(async()=>{calls++;return Response.json({});},{getAccessToken:()=>null,readRefreshToken:async()=>null,clear:async()=>{}});
  for(const action of [()=>api.listConsumption('today'),()=>api.getConsumption(id),()=>api.listBills(1,'all'),()=>api.listFeedback(1),()=>api.submitFeedback(input)])await assert.rejects(action(),error=>error.code==='UNAUTHORIZED');
  assert.equal(calls,0);
});
test('consumption reads validate filters, encode historical identifiers and use signed ownership',async()=>{
  const requests=[];const api=client(async(url,init)=>{requests.push({url,init});return Response.json(url.includes('/consumption/')?{id:'history:'+id,kind:'HISTORICAL',deviceId:id,deviceName:'工作电脑',platform:'Windows',occurredAt:date,model:null,chargedPoints:15,status:'HISTORICAL',needsReview:false,usage:null,rates:null,ratedPoints:null,breakdown:null}:{range:'week',from:date,to:date,chargedPoints:0,reviewCount:0,devices:[],data:[],total:0,page:2,pageSize:20});});
  await api.listConsumption('week',id,2);await api.getConsumption('history:'+id);
  assert.ok(requests[0].url.endsWith('/consumption?range=week&page=2&deviceId='+id));assert.ok(requests[1].url.endsWith('/consumption/history%3A'+id));
  for(const {init}of requests)assert.equal(init.headers.get('dpop'),'fixture-proof');
  assert.throws(()=>api.listConsumption('month'));assert.throws(()=>api.listConsumption('today','other-user'));assert.throws(()=>api.listConsumption('week',id,0));assert.throws(()=>api.getConsumption('../wallet'));assert.equal(requests.length,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FailureCapture,FailureFeedbackOutbox,sanitizeFailure,requestStats} from '../dist-electron/cloud/failure-feedback.js';
import {RemoteBridgeServer} from '../dist-electron/cloud/remote-bridge-server.js';
import {CloudError} from '../dist-electron/cloud/cloud-error.js';
import {HttpCloudClient} from '../dist-electron/cloud/http-cloud-client.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',MODEL='deepseek/fixture';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<60;i++){if(await check())return;await wait(10);}throw Error('condition timeout');}
const payload=(id='resp_fixture',output=[],status='completed')=>({id,object:'response',model:MODEL,status,output,usage:{input_tokens:1,output_tokens:1,total_tokens:2}});
const sse=events=>({contentType:'text/event-stream',response:new Response(events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join(''),{headers:{'X-Bridge-AI-Request-Id':randomUUID()}})});
const parseEvents=text=>text.split(/\n\n/).flatMap(block=>{const line=block.split('\n').find(v=>v.startsWith('data: '));return line?[JSON.parse(line.slice(6))]:[];});
async function setup(handler,owner=A){const reports=[],requests=[];const client={getMe:async()=>({id:A}),listModels:async()=>({data:[{id:MODEL,capabilities:{nativeResponses:true,responsesProfile:'deepseek'}}]}),createResponse:async(request,options)=>{requests.push(structuredClone(request));return handler(request,options,requests.length)}};const bridge=new RemoteBridgeServer(client,0,undefined,undefined,undefined,{getApiKey:async()=>'local-fixture',getModel:async()=>MODEL,failureFeedback:{appVersion:'0.3.6',ownerUserId:()=>owner,submit:report=>reports.push(report)}});const status=await bridge.start();return{bridge,reports,requests,post:(body,options={})=>fetch(`${status.endpoint}/v1/responses`,{method:'POST',headers:{authorization:'Bearer local-fixture','content-type':'application/json',session_id:'fixture-session'},body:JSON.stringify({model:MODEL,...body}),...options})};}
function encryption(){const key=randomBytes(32);return{isEncryptionAvailable:()=>true,encryptString(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]);},decryptString(value){const cipher=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));cipher.setAuthTag(value.subarray(12,28));return Buffer.concat([cipher.update(value.subarray(28)),cipher.final()]).toString();}};}
function report(marker='user excerpt',traceId=randomUUID()){const capture=new FailureCapture(A,'0.3.6',traceId);capture.request('desktop',{input:marker});return capture.failure('cloud_transport',{code:'SERVER_UNREACHABLE',message:'connection lost'});}

test('wallet exhaustion preserves HTTP 402 with Chinese recharge reason and the same uploaded reason',async()=>{
 const t=await setup(()=>{throw new CloudError('INSUFFICIENT_POINTS','old English quota message',{httpStatus:402,requestId:'wallet_request'})});
 try{const res=await t.post({input:'fixture',stream:true});assert.equal(res.status,402);const body=await res.json();assert.equal(body.error.code,'INSUFFICIENT_POINTS');assert.equal(body.error.type,'insufficient_quota');assert.match(body.error.message,/余额不足.*充值.*到账/);assert.equal(body.error.requestId,'wallet_request');assert.equal(t.reports[0].error.message,body.error.message);assert.equal(t.reports[0].requestId,'wallet_request');}finally{await t.bridge.stop();}
});

test('empty custom input terminates with tool-specific Chinese failed event and diagnostic tool IDs',async()=>{
 const call={type:'function_call',id:'bad_item',call_id:'bad_call',name:'functions__exec',arguments:'{}'};
 const t=await setup(()=>sse([{type:'response.created',sequence_number:4,response:payload('bad_response')},{type:'response.output_item.added',sequence_number:5,output_index:0,item:{...call,arguments:''}},{type:'response.function_call_arguments.done',sequence_number:6,item_id:call.id,output_index:0,arguments:'{}'}]));
 try{const res=await t.post({input:'fixture',stream:true,tools:[{type:'namespace',name:'functions',tools:[{type:'custom',name:'exec'}]}]});const events=parseEvents(await res.text()),last=events.at(-1);assert.equal(last.type,'response.failed');assert.equal(last.sequence_number,7);assert.equal(last.response.id,'bad_response');assert.equal(last.response.status,'failed');assert.match(last.response.error.message,/functions.exec.*空参数.*input/);assert.equal(events.filter(e=>e.type==='response.failed').length,1);assert.ok(!events.some(e=>e.type==='response.completed'));assert.equal(t.reports.length,1);assert.equal(t.reports[0].error.message,last.response.error.message);const detail=JSON.stringify(t.reports[0]);assert.match(detail,/EMPTY_ARGUMENTS/);assert.match(detail,/bad_call/);}finally{await t.bridge.stop();}
});

test('unexpected EOF and upstream bare errors have a failed terminal instead of a silent disconnect',async()=>{
 for(const last of [null,{type:'error',code:'rate_limit_exceeded',message:'upstream overloaded'}]) {
  const events=[{type:'response.created',response:payload('lost_response')},{type:'response.output_text.delta',delta:'partial fixture'}];if(last)events.push(last);
  const t=await setup(()=>sse(events));try{const result=parseEvents(await (await t.post({input:'fixture',stream:true})).text());assert.equal(result.at(-1).type,'response.failed');assert.equal(result.at(-1).response.id,'lost_response');assert.match(result.at(-1).response.error.message,last?/请求过多/:/连接已断开/);assert.ok(!result.some(e=>e.type==='response.completed'));assert.equal(t.reports.length,1);assert.equal(t.reports[0].error.message,result.at(-1).response.error.message);}finally{await t.bridge.stop();}
 }
});

test('a contradictory completed event is rejected before any successful terminal reaches Desktop',async()=>{
 const t=await setup(()=>sse([{type:'response.created',response:payload('contradictory')},{type:'response.completed',response:payload('contradictory',[],'failed')}]));
 try{const events=parseEvents(await (await t.post({input:'fixture',stream:true})).text());assert.ok(!events.some(e=>e.type==='response.completed'));assert.equal(events.at(-1).type,'response.failed');assert.match(events.at(-1).response.error.message,/完成事件.*不一致/);assert.equal(t.reports.length,1);}finally{await t.bridge.stop();}
});

test('upstream failed/incomplete details are retained in platform diagnostics and localized on the wire',async()=>{
 for(const status of ['failed','incomplete']) {
  const terminal={...payload('upstream_response',[],status),...(status==='failed'?{error:{code:'server_error',message:'provider internal fixture'}}:{incomplete_details:{reason:'max_output_tokens'}})};
  const t=await setup(()=>sse([{type:`response.${status}`,response:terminal}]));try{const events=parseEvents(await (await t.post({input:'fixture',stream:true})).text());assert.equal(events.at(-1).type,'response.failed');assert.equal(events.at(-1).response.status,'failed');assert.match(events.at(-1).response.error.message,status==='failed'?/内部错误/:/输出长度限制/);assert.equal(t.reports.length,1);assert.match(JSON.stringify(t.reports[0].reply),status==='failed'?/provider internal fixture/:/max_output_tokens/);assert.equal(t.reports[0].stage,status==='failed'?'stream_failed':'stream_incomplete');}finally{await t.bridge.stop();}
 }
});

test('failure excerpts retain authorized text/tool arguments but remove nested credentials, URL queries and binary',()=>{
 const input={input:'user document text',tools:[{name:'read_document'}],arguments:JSON.stringify({command:'fixed read',password:'hidden-password',token:'hidden-token',key:'hidden-key'}),output:'tool result',authorization:'Bearer hidden-auth',image_url:'data:image/png;base64,HIDDEN_IMAGE',file_data:'HIDDEN_FILE',encrypted_content:'HIDDEN_OPAQUE',text:'sk-abcdefghijk Bearer hidden-bearer eyJabc.def.ghi https://example.test/a?q=HIDDEN_QUERY',cookie:'HIDDEN_COOKIE',delta:'"password":"HIDDEN_PARTIAL_JSON", OPENAI_API_KEY=HIDDEN_ENV_KEY'};
 const text=JSON.stringify(sanitizeFailure(input).value);assert.match(text,/user document text|fixed read|tool result/);assert.doesNotMatch(text,/hidden-password|hidden-token|hidden-key|hidden-auth|HIDDEN_IMAGE|HIDDEN_FILE|HIDDEN_OPAQUE|hidden-bearer|eyJabc|HIDDEN_QUERY|HIDDEN_COOKIE|HIDDEN_PARTIAL_JSON|HIDDEN_ENV_KEY|sk-abcdefghijk/);
});

test('bounded capture retains latest input and terminal error and never mutates model data',()=>{
 const input=Array.from({length:100},(_,i)=>({role:'user',content:i===99?'LATEST_DOCUMENT_TURN':'older '+('x'.repeat(4000))}));const original=structuredClone(input);const capture=new FailureCapture(A,'0.3.6',randomUUID());capture.request('desktop',{input});capture.request('forwarded',{input});for(let i=0;i<200;i++)capture.event({type:'response.output_text.delta',delta:'text '+i});capture.event({type:'response.failed',response:{error:{message:'FINAL_FAILURE'}}});const result=capture.failure('stream_failed',{code:'FAIL',message:'failed'});
 assert.ok(result.truncated);assert.ok(Buffer.byteLength(JSON.stringify(result))<96*1024);assert.match(JSON.stringify(result.request),/LATEST_DOCUMENT_TURN/);assert.match(JSON.stringify(result.reply),/FINAL_FAILURE/);assert.deepEqual(input,original);assert.equal(capture.failure('stream_failed',{}),null);
});

test('local validation feedback is once and does not make a model POST',async()=>{
 const t=await setup(()=>{throw Error('must not POST')});try{const response=await t.post({input:[{type:'function_call',name:'x'}]});assert.equal(response.status,400);await response.json();assert.equal(t.requests.length,0);assert.equal(t.reports.length,1);assert.equal(t.reports[0].stage,'local_validation');assert.equal(t.reports[0].ownerUserId,A);}finally{await t.bridge.stop();}
});

test('HTTP and network failures include request excerpts and do not retry generation',async()=>{
 for(const error of [new CloudError('UPSTREAM_ERROR','sk-abcdefghijk failed',{httpStatus:502,requestId:'req_fixture',responseBody:{error:{message:'safe provider error'}}}),new CloudError('SERVER_UNREACHABLE','network lost')]){const t=await setup(()=>{throw error});try{const response=await t.post({input:'DOCUMENT_TEXT',stream:true});await response.text();assert.equal(t.requests.length,1);assert.equal(t.reports.length,1);assert.equal(t.reports[0].stage,error.httpStatus?'cloud_http':'cloud_transport');assert.match(JSON.stringify(t.reports[0].request),/DOCUMENT_TEXT/);assert.doesNotMatch(JSON.stringify(t.reports),/sk-abcdefghijk/);}finally{await t.bridge.stop();}}
});

test('failed, incomplete and disconnected SSE upload once; normal stream has no feedback',async()=>{
 for(const status of ['failed','incomplete','disconnected','completed']){const events=[{type:'response.created',response:payload()} ,{type:'response.output_text.delta',delta:'AUTHORIZED_REPLY'}];if(status!=='disconnected')events.push({type:'response.'+status,response:payload('resp_fixture',[],status)});const t=await setup(()=>sse(events));try{const response=await t.post({input:'document',stream:true});await response.text();assert.equal(t.requests.length,1);assert.equal(t.reports.length,status==='completed'?0:1);if(t.reports.length){assert.equal(t.reports[0].stage,status==='disconnected'?'stream_disconnected':'stream_'+status);assert.match(JSON.stringify(t.reports[0].reply),/AUTHORIZED_REPLY/);}}finally{await t.bridge.stop();}}
});

test('active desktop cancellation is not reported as a model failure',async()=>{
 const t=await setup(()=>({contentType:'text/event-stream',response:new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.from('data: '+JSON.stringify({type:'response.created',response:payload()})+'\n\n'));},cancel(){}}))}));const cancel=new AbortController();try{const response=await t.post({input:'document',stream:true},{signal:cancel.signal});cancel.abort();await response.text().catch(()=>{});await wait(25);assert.equal(t.reports.length,0);}finally{await t.bridge.stop();}
});

test('malformed SSE captures a sanitized broken frame and reports once without another model POST',async()=>{
 const t=await setup(()=>({contentType:'text/event-stream',response:new Response('data: {"password":"BROKEN_FRAME_SECRET", invalid\n\n')}));try{const response=await t.post({input:'document',stream:true});await response.text();assert.equal(t.reports.length,1);assert.equal(t.requests.length,1);assert.equal(t.reports[0].stage,'stream_failed');assert.match(JSON.stringify(t.reports[0].reply),/invalid_json_frame/);assert.doesNotMatch(JSON.stringify(t.reports[0].reply),/BROKEN_FRAME_SECRET/);}finally{await t.bridge.stop();}
});

test('unknown actor does not upload request contents',async()=>{
 const t=await setup(()=>{throw new CloudError('SERVER_UNREACHABLE','lost')},null);try{await(await t.post({input:'NOT_AUTHENTICATED_TEXT'})).text();assert.equal(t.reports.length,0);}finally{await t.bridge.stop();}
});

test('100KB code tool output after synthetic >1h pause remains exact on forwarded wire despite excerpt truncation',async t=>{
 const call={type:'function_call',id:'fc_fixture',name:'write_code',call_id:'call_fixture',arguments:'{}'},longCode='export const fixed = 1;\n'.repeat(6000)+'TAIL_CODE';let now=Date.now();t.mock.method(Date,'now',()=>now);
 const fixture=await setup((request,options,count)=>count===1?{contentType:'application/json',response:Response.json(payload('resp_first',[call]))}:{contentType:'application/json',response:Response.json(payload('resp_second'))});
 try{const first=await(await fixture.post({input:'write fixed fixture',tools:[{type:'function',name:'write_code',parameters:{type:'object',properties:{}}}]})).json();now+=2*3600000;const second=await fixture.post({previous_response_id:first.id,input:[{type:'function_call_output',call_id:'call_fixture',output:longCode}]});assert.equal(second.status,200);await second.json();assert.equal(fixture.requests.length,2);assert.equal(fixture.requests[1].input.find(item=>item.type==='function_call_output').output,longCode);assert.equal(fixture.requests[1].previous_response_id,undefined);assert.equal(fixture.reports.length,0);}finally{await fixture.bridge.stop();}
});

test('encrypted outbox survives restart, binds owners, retries feedback alone and deduplicates trace',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'feedback-queue-')),path=join(dir,'outbox.enc'),crypto=encryption();let now=Date.now(),owner=A,attempts=0;const uploads=[];
 const first=new FailureFeedbackOutbox({path,encryption:crypto,now:()=>now,owner:()=>owner,upload:async item=>{attempts++;uploads.push(item);throw new CloudError('SERVER_UNREACHABLE','offline')}});
 try{const item=report('ENCRYPTED_DOCUMENT_MARKER');first.enqueue(item);first.enqueue(item);await until(()=>attempts===1);await until(async()=>{try{return JSON.parse(crypto.decryptString(await readFile(path))).items[0].attempts===1}catch{return false}});assert.doesNotMatch((await readFile(path)).toString(),/ENCRYPTED_DOCUMENT_MARKER/);first.stop();
  owner=B;const restored=new FailureFeedbackOutbox({path,encryption:crypto,now:()=>now,owner:()=>owner,upload:async item=>{uploads.push(item)}});try{now+=6000;await restored.flush();assert.equal(uploads.length,1);owner=A;await restored.flush();assert.equal(uploads.length,2);assert.equal(uploads[1].id,item.id);await until(async()=>JSON.parse(crypto.decryptString(await readFile(path))).items.length===0);}finally{restored.stop();}
 }finally{await first.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test('outbox has 20 report / 2MiB / 7day bounds and no plaintext fallback when encryption is unavailable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'feedback-limit-')),path=join(dir,'outbox.enc'),crypto=encryption();let now=Date.now();const queue=new FailureFeedbackOutbox({path,encryption:crypto,now:()=>now,owner:()=>null,upload:async()=>{throw Error('no owner')}});
 try{for(let i=0;i<25;i++)queue.enqueue(report('fixture '+i));await until(async()=>{try{return JSON.parse(crypto.decryptString(await readFile(path))).items.length===20}catch{return false}});assert.ok((await stat(path)).size<=2*1024*1024);queue.stop();now+=8*86400000;const restored=new FailureFeedbackOutbox({path,encryption:crypto,now:()=>now,owner:()=>A,upload:async()=>{throw Error('expired report uploaded')}});await restored.flush();restored.stop();
 const plainPath=join(dir,'no-crypto');const memory=new FailureFeedbackOutbox({path:plainPath,encryption:{...crypto,isEncryptionAvailable:()=>false},owner:()=>null,upload:async()=>{}});memory.enqueue(report('PLAINTEXT_FORBIDDEN'));await wait(40);await assert.rejects(stat(plainPath));memory.stop();
 }finally{await queue.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test('closing outbox ignores pending enqueue and late uploads cannot overwrite a replacement instance',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'feedback-close-')),path=join(dir,'outbox.enc'),crypto=encryption();let releaseUpload,uploads=0;
 const old=new FailureFeedbackOutbox({path,encryption:crypto,owner:()=>A,upload:()=>{uploads++;return new Promise(resolve=>{releaseUpload=resolve})}});
 try{old.enqueue(report('old pending upload'));await until(()=>Boolean(releaseUpload));await old.close();
  const replacement=new FailureFeedbackOutbox({path,encryption:crypto,owner:()=>A,upload:async()=>{uploads++}});
  try{await replacement.flush();const latest=await readFile(path);assert.equal(JSON.parse(crypto.decryptString(latest)).items.length,0);releaseUpload();old.enqueue(report('closed report'));await old.flush();await wait(30);assert.equal(uploads,2);assert.deepEqual(await readFile(path),latest);}finally{await replacement.close();}
  const pendingPath=join(dir,'pending.enc'),pending=new FailureFeedbackOutbox({path:pendingPath,encryption:crypto,owner:()=>A,upload:async()=>{throw Error('closed queue uploaded')}});pending.enqueue(report());await pending.close();await wait(20);await assert.rejects(stat(pendingPath));
 }finally{releaseUpload?.();await old.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test('feedback Http client uses DPoP/device identity and bounded sanitized HTTP error body',async()=>{
 const calls=[],proofs=[];const tokens={getAccessToken:()=> 'fixture-token'},client=new HttpCloudClient({baseUrl:'https://fixture.test',tokens,devices:{get:async()=>({deviceId:B})},deviceKeys:{get:async()=>({sign:(method,url,token,body)=>{proofs.push({method,url,body});return new Headers({'DPoP':'fixture-proof'})}})},fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith('/api/v1/auth/me'))return Response.json({user:{id:A,email:'fixture@example.test',role:'USER',status:'ACTIVE'}});if(url.endsWith('/api/v1/diagnostics/failures'))return Response.json({id:JSON.parse(options.body).id,received:true,duplicate:false});return Response.json({error:{code:'UPSTREAM_ERROR',message:'safe',requestId:'req_fixture',secret:'PRIVATE_HTTP_SECRET'}},{status:502})}});
 await client.getMe();const item=report();await client.submitFailureFeedback(item);assert.equal(calls.at(-1).options.headers.get('X-Device-ID'),B);assert.equal(calls.at(-1).options.headers.get('DPoP'),'fixture-proof');assert.equal(proofs.at(-1).url,'https://fixture.test/api/v1/diagnostics/failures');
 assert.throws(()=>client.submitFailureFeedback({...item,ownerUserId:B}),/another account/);await assert.rejects(client.createResponse({model:MODEL,input:'fixture'},{threadId:'fixture'}),error=>{assert.equal(error.httpStatus,502);assert.doesNotMatch(JSON.stringify(error.responseBody),/PRIVATE_HTTP_SECRET/);return true;});
});

test('restored refresh-only session caches verified getMe owner for automatic feedback',async()=>{
 let access=null;const user={id:A,email:'fixture-a@example.test',role:'USER',status:'ACTIVE'},device={deviceId:B,deviceName:'fixture',platform:'win32',osVersion:'11',appVersion:'0.3.6'},registered={...device,id:randomUUID(),userId:A,status:'ACTIVE',activatedAt:new Date().toISOString(),lastSeenAt:null};
 const routes=[];const client=new HttpCloudClient({baseUrl:'https://fixture.test',tokens:{getAccessToken:()=>access,readRefreshToken:async()=>'fixture-refresh-token',rotate:async data=>{access=data.accessToken}},devices:{get:async()=>device},deviceKeys:{get:async()=>({publicKeyJwk:{kty:'EC',crv:'P-256',x:'x',y:'y'},sign:()=>new Headers()})},fetch:async url=>{routes.push(new URL(url).pathname);if(url.endsWith('/auth/refresh'))return Response.json({accessToken:'restored-access',refreshToken:'rotated-refresh',expiresIn:1800});if(url.endsWith('/devices/register'))return Response.json({device:registered});return Response.json({user})}});
 assert.equal(client.getCachedUserId(),null);assert.equal((await client.getMe()).id,A);assert.equal(client.getCachedUserId(),A);assert.deepEqual(routes,['/api/v1/auth/refresh','/api/v1/devices/register','/api/v1/auth/me']);
});

test('stale getMe response cannot overwrite owner after a concurrent account login',async()=>{
 let access='old-access',resolveMe;const device={deviceId:B,deviceName:'fixture',platform:'win32',osVersion:'11',appVersion:'0.3.6'},newUser={id:B,email:'fixture-b@example.test',role:'USER',status:'ACTIVE'};
 const client=new HttpCloudClient({baseUrl:'https://fixture.test',tokens:{getAccessToken:()=>access,rotate:async data=>{access=data.accessToken}},devices:{get:async()=>device},deviceKeys:{get:async()=>({publicKeyJwk:{kty:'EC',crv:'P-256',x:'x',y:'y'},sign:()=>new Headers()})},fetch:async url=>url.endsWith('/auth/me')?new Promise(resolve=>{resolveMe=resolve}):Response.json({accessToken:'new-access',refreshToken:'new-refresh',expiresIn:1800,user:newUser,device:{...device,id:randomUUID(),userId:B,status:'ACTIVE',activatedAt:new Date().toISOString(),lastSeenAt:null}})});
 const pending=client.getMe();await until(()=>Boolean(resolveMe));await client.login({email:newUser.email,password:'synthetic-fixture',device});resolveMe(Response.json({user:{id:A,email:'fixture-a@example.test',role:'USER',status:'ACTIVE'}}));assert.equal((await pending).id,A);assert.equal(client.getCachedUserId(),B);
});

test('request statistics measure full protocol payload independently of bounded private excerpts',()=>{
 const request={input:[{type:'function_call',call_id:'call1',name:'write',arguments:'一'.repeat(50000)},{type:'custom_tool_call',input:'fixed'},{type:'function_call_output',output:[{type:'input_text',text:'private output'}]},...Array.from({length:80},()=>({role:'user',content:'private document'}))],tools:[{type:'function',name:'write'}]};
 const bodyBytes=Buffer.byteLength(JSON.stringify(request)),stats=requestStats(request,bodyBytes),capture=new FailureCapture(A,'0.3.7',randomUUID());capture.request('desktop',request);capture.stats('desktop',stats);const result=capture.failure('cloud_http',{code:'PAYLOAD_TOO_LARGE',message:'capacity'});
 assert.equal(stats.inputCount,83);assert.equal(stats.toolCallCount,2);assert.equal(stats.toolArgumentBytes,150005);assert.equal(stats.toolOutputCount,1);assert.equal(stats.toolOutputBytes,Buffer.byteLength(JSON.stringify(request.input[2].output)));assert.deepEqual(result.requestStats.desktop,stats);assert.ok(result.truncated);assert.ok(Buffer.byteLength(JSON.stringify(result))<96*1024);assert.doesNotMatch(JSON.stringify(stats),/private|write|一/);
});

test('local Bridge forwards exact 64MiB code payload unchanged; oversized input returns diagnostic 413 before Cloud',async()=>{
 const limit=64*1024*1024,base={model:MODEL,input:[{type:'function_call',call_id:'large_call',name:'write_code',arguments:''}]},overhead=Buffer.byteLength(JSON.stringify(base));const code='CODE_START\n'+' '.repeat(limit-overhead-100)+'\nCODE_END';base.input[0].arguments=code;
 // Account for JSON newline escapes; pad the actual JSON wire to exactly the boundary.
 let body=JSON.stringify(base);body+=' '.repeat(limit-Buffer.byteLength(body));assert.equal(Buffer.byteLength(body),limit);
 const fixture=await setup(request=>{assert.equal(request.input[0].arguments,code);throw new CloudError('PAYLOAD_TOO_LARGE','provider capacity',{httpStatus:413})});
 try{const response=await fixture.post({}, {body});assert.equal(response.status,413);await response.json();assert.equal(fixture.requests.length,1);assert.equal(fixture.reports.length,1);assert.equal(fixture.reports[0].requestStats.desktop.bodyBytes,limit);assert.equal(fixture.reports[0].requestStats.desktop.toolArgumentBytes,Buffer.byteLength(code));assert.ok(fixture.reports[0].requestStats.forwarded.bodyBytes>10*1024*1024);assert.ok(Buffer.byteLength(JSON.stringify(fixture.reports[0]))<96*1024);
  const tooLarge=await fixture.post({}, {body:body+' '});assert.equal(tooLarge.status,413);const error=await tooLarge.json();assert.equal(error.error.code,'PAYLOAD_TOO_LARGE');assert.equal(fixture.requests.length,1);assert.equal(fixture.reports.length,2);assert.equal(fixture.reports[1].stage,'local_validation');assert.equal(fixture.reports[1].requestStats.desktop.declaredBodyBytes,limit+1);assert.ok(fixture.reports[1].requestStats.desktop.bodyBytes>limit);assert.deepEqual(fixture.reports[1].request,{});
 }finally{await fixture.bridge.stop();}
});

test('HTML 413 has actionable capacity error and bounded sanitized proxy excerpt while formal Cloud errors remain intact',async()=>{
 const tokens={getAccessToken:()=> 'fixture-token'},devices={get:async()=>({deviceId:B})},deviceKeys={get:async()=>({sign:()=>new Headers()})};
 for(const formal of [false,true]){const client=new HttpCloudClient({baseUrl:'https://fixture.test',tokens,devices,deviceKeys,fetch:async()=>formal?Response.json({error:{code:'UPSTREAM_PAYLOAD_LIMIT',message:'正式上游容量说明',requestId:'formal_req'}},{status:413}):new Response('<html>nginx 413 password="PROXY_SECRET" '+'x'.repeat(90000)+'</html>',{status:413})});
  await assert.rejects(client.createResponse({model:MODEL,input:'fixture'},{threadId:'fixture'}),error=>{assert.equal(error.httpStatus,413);assert.equal(error.code,formal?'UPSTREAM_PAYLOAD_LIMIT':'PAYLOAD_TOO_LARGE');assert.match(error.message,formal?/正式上游/:/容量/);assert.ok(Buffer.byteLength(JSON.stringify(error.responseBody))<13*1024);assert.doesNotMatch(JSON.stringify(error.responseBody),/PROXY_SECRET/);return true;});
 }
});

test('model HTTP deadline is 70min/configurable, management stays 15s and caller cancellation remains linked',async t=>{
 const deadlines=[];t.mock.method(AbortSignal,'timeout',ms=>{deadlines.push(ms);return new AbortController().signal});let requestSignal;
 const make=extra=>new HttpCloudClient({baseUrl:'https://fixture.test',tokens:{getAccessToken:()=> 'fixture-token'},devices:{get:async()=>({deviceId:B})},deviceKeys:{get:async()=>({sign:()=>new Headers()})},fetch:async(url,options)=>{requestSignal=options.signal;return url.endsWith('/auth/me')?Response.json({user:{id:A,email:'fixture@example.test',role:'USER',status:'ACTIVE'}}):Response.json(payload())},...extra});
 const client=make({});await client.getMe();const cancel=new AbortController();await client.createResponse({model:MODEL,input:'fixture'},{threadId:'fixture',signal:cancel.signal});assert.deepEqual(deadlines,[15000,70*60000]);assert.equal(requestSignal.aborted,false);cancel.abort();assert.equal(requestSignal.aborted,true);await make({responseTimeoutMs:12345}).createResponse({model:MODEL,input:'fixture'},{threadId:'fixture'});assert.equal(deadlines.at(-1),12345);
});

test('20MiB continuous tool/text values cannot overflow redaction regex or interrupt forwarding',async()=>{
 const huge='x'.repeat(20*1024*1024),capture=new FailureCapture(A,'0.3.7',randomUUID());const safe=sanitizeFailure({input:huge},20*1024);assert.ok(safe.truncated);assert.ok(Buffer.byteLength(JSON.stringify(safe.value))<20*1024);capture.request('desktop',{input:huge});capture.event({type:'response.output_text.delta',delta:huge});capture.http({output:huge});capture.stats('desktop',{bodyBytes:20*1024*1024});assert.ok(capture.failure('cloud_transport',{message:huge}).truncated);
 const fixture=await setup(request=>{assert.equal(request.input[0].content,huge);return {contentType:'application/json',response:Response.json(payload())}});try{const response=await fixture.post({input:huge});assert.equal(response.status,200);await response.json();assert.equal(fixture.requests.length,1);assert.equal(fixture.reports.length,0);}finally{await fixture.bridge.stop();}
});

test('diagnostic acquisition failures fail closed without throwing or retaining unsanitized content',()=>{
 const poison=new Proxy({},{ownKeys(){throw Error('private-credential-in-error')}}),capture=new FailureCapture(A,'0.3.7',randomUUID());assert.doesNotThrow(()=>{capture.request('desktop',poison);capture.http(poison);capture.event(poison);capture.stats('desktop',{bodyBytes:-1});});const report=capture.failure('local_validation',{message:'safe failure'});assert.ok(report.truncated);assert.doesNotMatch(JSON.stringify(report),/private-credential-in-error/);assert.match(JSON.stringify(report),/diagnostic excerpt unavailable/);
 const text=JSON.stringify(sanitizeFailure({input:'password="'+('S'.repeat(20*1024*1024))+'"\nSAFE_LAST_LINE'}).value);assert.doesNotMatch(text,/SSSSSS/);assert.match(text,/SAFE_LAST_LINE/);
 const brokenError=new Proxy({},{get(){throw Error('UNSAFE_CAPTURE_EXCEPTION')}}),fallback=new FailureCapture(A,'0.3.7',randomUUID()).failure('local_validation',brokenError);assert.equal(fallback.error.code,'DIAGNOSTIC_CAPTURE_ERROR');assert.doesNotMatch(JSON.stringify(fallback),/UNSAFE_CAPTURE_EXCEPTION/);
});

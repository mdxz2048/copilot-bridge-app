import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteBridgeServer } from '../dist-electron/cloud/remote-bridge-server.js';
import { redactTrace } from '../dist-electron/cloud/bridge-trace.js';
const response=(id,output=[],status='completed')=>({id,object:'response',status,model:'logical',output,usage:{input_tokens:1,output_tokens:1,total_tokens:2}});
async function setup(handler) {
 const bridge=new RemoteBridgeServer({getMe:async()=>({id:'account'}),listModels:async()=>({data:[{id:'logical',capabilities:{nativeResponses:true}}]}),createResponse:handler},0,undefined,undefined,undefined,{getApiKey:async()=>'key',getModel:async()=>'logical',getReasoning:async()=>'normal'});
 const status=await bridge.start();
 const post=(body,headers={})=>fetch(status.endpoint+'/v1/responses',{method:'POST',headers:{authorization:'Bearer key','content-type':'application/json',...headers},body:JSON.stringify({model:'desktop',...body})});
 return {bridge,post};
}
test('previous_response_id restores immutable response snapshots and preserves semantics',async()=>{
 const requests=[];const {bridge,post}=await setup(async(request,options)=>{requests.push({request:structuredClone(request),threadId:options.threadId});return {contentType:'application/json',response:Response.json(response('r'+requests.length,[{type:'message',id:'m'+requests.length,role:'assistant',content:[{type:'output_text',text:'answer'+requests.length}]}]))}});
 try {
  assert.equal((await post({input:'first',instructions:'system policy',future:{yes:true}})).status,200);
  assert.equal((await post({input:'second',previous_response_id:'r1',tool_choice:'auto',parallel_tool_calls:false})).status,200);
  assert.equal((await post({input:'branch',previous_response_id:'r1'})).status,200);
  assert.deepEqual(requests[1].request.input.map(i=>i.content),['first',[{type:'output_text',text:'answer1'}],'second']);
  assert.deepEqual(requests[2].request.input.map(i=>i.content),['first',[{type:'output_text',text:'answer1'}],'branch']);
  assert.equal(requests[0].threadId,requests[1].threadId); assert.equal(requests[1].request.previous_response_id,undefined);
  assert.equal(requests[0].request.instructions,'system policy');assert.deepEqual(requests[0].request.future,{yes:true});assert.deepEqual(requests[0].request.reasoning,{mode:'normal'});
  assert.equal((await post({input:'x',previous_response_id:'unknown'})).status,422);
 }finally{await bridge.stop()}
});
test('native apply_patch output-only continuation keeps custom tool wire semantics',async()=>{
 const requests=[];const call={type:'custom_tool_call',id:'c',call_id:'custom1',name:'apply_patch',input:'synthetic patch'};
 const {bridge,post}=await setup(async(request,options)=>{requests.push({request:structuredClone(request),threadId:options.threadId});return {contentType:'application/json',response:Response.json(response('r'+requests.length,requests.length===1?[{type:'reasoning',id:'reason1',summary:[],encrypted_content:'opaque'},call]:[]))}});
 try{assert.equal((await post({input:'edit fixture',tools:[{type:'custom',name:'apply_patch'}]})).status,200);assert.equal((await post({input:[{type:'custom_tool_call_output',call_id:'custom1',output:'done'}]})).status,200);assert.equal(requests[0].threadId,requests[1].threadId);assert.equal(requests[1].request.input.at(-1).type,'custom_tool_call_output');assert.equal(requests[1].request.input[1].type,'reasoning')}finally{await bridge.stop()}
});
test('data-only SSE terminal incomplete and unknown events retain IDs and settle once',async()=>{
 const settled=[]; const terminal=response('r1',[{type:'reasoning',id:'reason1',summary:[]}],'incomplete');
 const stream=['id: event-id','retry: 500','data: '+JSON.stringify({type:'vendor.future',extra:42}),'','data: '+JSON.stringify({type:'response.incomplete',response:terminal}),'',''].join('\n');
 const client={getMe:async()=>({id:'a'}),createResponse:async()=>({contentType:'text/event-stream',response:new Response(stream)})};
 const bridge=new RemoteBridgeServer(client,0,undefined,undefined,target=>settled.push(target));const status=await bridge.start();
 try{const res=await fetch(status.endpoint+'/v1/responses',{method:'POST',body:JSON.stringify({model:'logical',input:'x',stream:true})});const text=await res.text();assert.match(text,/id: event-id/);assert.match(text,/retry: 500/);assert.match(text,/vendor.future/);assert.equal(settled.length,1);assert.equal(settled[0].recovery,false)}finally{await bridge.stop()}
});
test('trace redacts private contents and unknown strings even in fallback metadata',()=>{
 const redacted=JSON.stringify(redactTrace({body:{input:[{content:'private document'}],instructions:'private policy',tools:[{description:'private notes'}],unknown:'private secret'},message:'private error',apiKey:'sk-123456789abcdef',event:'response.completed',path:'/v1/responses'}));
 assert.doesNotMatch(redacted,/private|sk-123/);assert.match(redacted,/response.completed/);assert.match(redacted,/\/v1\/responses/);
});

import { InputItemSchema, OutputItemSchema } from '../dist-electron/cloud/contract.js';
test('unknown items preserve shape while malformed known calls cannot bypass validation',()=>{assert.equal(InputItemSchema.safeParse({type:'future_type',data:1}).success,true);assert.equal(InputItemSchema.safeParse({type:'function_call',arguments:'{}'}).success,false);assert.equal(InputItemSchema.safeParse({type:'function_call_output',call_id:'x'}).success,false);assert.equal(OutputItemSchema.safeParse({type:'function_call',arguments:'{}'}).success,false)});

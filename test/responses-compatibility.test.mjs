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
import {createDesktopEventTranslator,normalizeDesktopRequest} from '../dist-electron/cloud/desktop-protocol.js';
test('unknown items preserve shape while malformed known calls cannot bypass validation',()=>{assert.equal(InputItemSchema.safeParse({type:'future_type',data:1}).success,true);assert.equal(InputItemSchema.safeParse({type:'function_call',arguments:'{}'}).success,false);assert.equal(InputItemSchema.safeParse({type:'function_call_output',call_id:'x'}).success,false);assert.equal(OutputItemSchema.safeParse({type:'function_call',arguments:'{}'}).success,false)});

const sseEvents=text=>text.split(/\n\n/).flatMap(block=>{const data=block.split('\n').find(line=>line.startsWith('data: '));return data?[JSON.parse(data.slice(6))]:[]});
const splitStream=events=>{
 const bytes=new TextEncoder().encode(events.map(event=>`id: fixture\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
 return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close()}}));
};
test('custom wrapper SSE handles empty added, split JSON escapes, complete terminal and output-only native continuation',async()=>{
 const rawInput='text("你好\\n")\n// \\u0041 "quoted" 🧪',args=JSON.stringify({input:rawInput});
 const call={type:'function_call',id:'item_custom',call_id:'call_custom',name:'functions__exec',arguments:args};
 const meta={item_id:call.id,output_index:2};
 const events=[{type:'response.created',response:response('r_custom')},{type:'response.output_item.added',output_index:2,item:{...call,arguments:'',status:'in_progress'}},...[...args].map(delta=>({type:'response.function_call_arguments.delta',...meta,delta})),{type:'response.function_call_arguments.done',...meta,arguments:args},{type:'response.output_item.done',output_index:2,item:{...call,status:'completed'}},{type:'response.completed',response:response('r_custom',[call])}];
 const requests=[];const {bridge,post}=await setup(async(request,options)=>{
  requests.push({request:structuredClone(request),threadId:options.threadId});
  if(requests.length===1){assert.equal(request.tools[0].type,'function');assert.equal(request.tools[0].name,'functions__exec');return{contentType:'text/event-stream',response:splitStream(events)}}
  // Verify the real native Cloud wire contract instead of accepting any mock payload.
  const replay=request.input.find(item=>item.call_id==='call_custom'&&item.type==='function_call');assert.equal(replay.arguments,args);
  const output=request.input.at(-1);assert.deepEqual(output,{type:'function_call_output',call_id:'call_custom',output:'marker-ok'});
  assert.equal(request.tools[0].type,'function');return{contentType:'application/json',response:Response.json(response('r_final'))};
 });
 try{
  const stream=await post({input:'safe fixture',stream:true,tools:[{type:'namespace',name:'functions',tools:[{type:'custom',name:'exec'}]}]});
  const text=await stream.text(),received=sseEvents(text);assert.equal(received[1].item.type,'custom_tool_call');assert.equal(received[1].item.input,'');assert.equal(received[1].item.namespace,'functions');assert.equal(received[1].output_index,2);assert.equal(received[1].item.call_id,'call_custom');
  assert.equal(received.filter(event=>event.type==='response.custom_tool_call_input.delta').map(event=>event.delta).join(''),rawInput);
  assert.equal(received.find(event=>event.type==='response.custom_tool_call_input.done').input,rawInput);
  assert.equal(received.at(-1).response.output[0].input,rawInput);assert.ok(!received.some(event=>event.type.startsWith('response.function_call_arguments')));assert.doesNotMatch(text,/"arguments":/);assert.match(text,/event: response.custom_tool_call_input.delta/);
  assert.equal((await post({input:[{type:'custom_tool_call_output',call_id:'call_custom',output:'marker-ok'}]})).status,200);assert.equal(requests[0].threadId,requests[1].threadId);
 }finally{await bridge.stop()}
});
test('malformed final custom JSON becomes a clear SSE protocol error, not a disconnected socket',async()=>{
 const {bridge,post}=await setup(async()=>({contentType:'text/event-stream',response:splitStream([{type:'response.output_item.added',output_index:0,item:{type:'function_call',id:'bad',call_id:'bad_call',name:'exec',arguments:''}},{type:'response.function_call_arguments.done',item_id:'bad',output_index:0,arguments:'{"input":"private unfinished'}])}));
 try{const stream=await post({input:'safe',stream:true,tools:[{type:'custom',name:'exec'}]});const text=await stream.text();const events=sseEvents(text);assert.equal(events.at(-1).type,'error');assert.equal(events.at(-1).code,'INVALID_SERVER_RESPONSE');assert.doesNotMatch(text,/private unfinished|Unexpected end of JSON/);}finally{await bridge.stop()}
});
test('per-stream custom state cannot contaminate another stream and ordinary function deltas pass unchanged',()=>{
 const custom=new Set(['exec']),binding=new Map([['exec',{name:'exec',custom:true}]]),first=createDesktopEventTranslator(custom,binding),second=createDesktopEventTranslator(custom,binding);
 const added={type:'response.output_item.added',output_index:0,item:{type:'function_call',id:'same',call_id:'c',name:'exec',arguments:''}};
 first(added);second(added);first({type:'response.function_call_arguments.delta',item_id:'same',output_index:0,delta:'{"input":"A'});
 assert.equal(second({type:'response.function_call_arguments.done',item_id:'same',output_index:0,arguments:'{"input":"B"}'}).at(-1).input,'B');
 const fn={type:'response.function_call_arguments.delta',item_id:'ordinary',output_index:1,delta:'{"x":'};assert.deepEqual(first(fn),[fn]);
 const normalized=normalizeDesktopRequest({model:'logical',input:[{type:'custom_tool_call_output',call_id:'c',output:'ok'}]},true,{input:[{type:'function_call',call_id:'c',name:'exec',arguments:'{"input":"x"}'}],toolBindings:binding});assert.equal(normalized.request.input[0].type,'function_call_output');
});
test('surrogate pairs split across JSON deltas stay intact and item.done completes missing arguments.done',()=>{
 const translate=createDesktopEventTranslator(new Set(['exec']));
 translate({type:'response.output_item.added',output_index:2,item:{type:'function_call',id:'unicode',call_id:'c',name:'exec',arguments:''}});
 assert.deepEqual(translate({type:'response.function_call_arguments.delta',item_id:'unicode',output_index:2,delta:'{"input":"\\uD83D'}),[]);
 const next=translate({type:'response.function_call_arguments.delta',item_id:'unicode',output_index:2,delta:'\\uDE00'});assert.equal(next[0].delta,'😀');
 const done=translate({type:'response.output_item.done',output_index:2,item:{type:'function_call',id:'unicode',call_id:'c',name:'exec',arguments:'{"input":"\\uD83D\\uDE00!"}'}});
 assert.equal(done[0].delta,'!');assert.equal(done[1].type,'response.custom_tool_call_input.done');assert.equal(done[1].input,'😀!');assert.equal(done[2].item.input,'😀!');
});

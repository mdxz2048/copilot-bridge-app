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
import {desktopOutputItem} from '../dist-electron/cloud/desktop-protocol.js';

test('code alias is limited to declared official code wrappers in JSON and split SSE',()=>{
 const n=normalizeDesktopRequest({input:'fixture',tools:[{type:'namespace',name:'functions',tools:[{type:'custom',name:'exec'}]},{type:'function',name:'python',parameters:{type:'object',properties:{code:{type:'string'}}}}]},true);
 const code='text("中文😀\\n")',call={type:'function_call',id:'alias_item',call_id:'alias_call',name:'functions__exec',arguments:JSON.stringify({code})};
 assert.equal(desktopOutputItem(call,n.customTools,n.toolBindings).input,code);
 const translate=createDesktopEventTranslator(n.customTools,n.toolBindings),events=[];
 events.push(...translate({type:'response.output_item.added',output_index:0,item:{...call,arguments:''}}));
 for(const delta of call.arguments)events.push(...translate({type:'response.function_call_arguments.delta',item_id:call.id,output_index:0,delta}));
 events.push(...translate({type:'response.function_call_arguments.done',item_id:call.id,output_index:0,arguments:call.arguments}));
 events.push(...translate({type:'response.output_item.done',output_index:0,item:call}));
 events.push(...translate({type:'response.completed',response:response('alias_response',[call])}));
 assert.equal(events.filter(e=>e.type==='response.custom_tool_call_input.delta').map(e=>e.delta).join(''),code);
 assert.equal(events.filter(e=>e.type==='response.custom_tool_call_input.done').length,1);
 assert.equal(events.at(-1).response.output[0].input,code);
 const fn={...call,name:'python'};assert.deepEqual(desktopOutputItem(fn,n.customTools,n.toolBindings),fn);
 for(const arguments_ of ['{}','{"code":""}','{"code":1}','{"input":"a","code":"b"}','{"command":"pwd"}','null','[]','{"input":1}','{"input":"unfinished'])assert.throws(()=>desktopOutputItem({...call,arguments:arguments_},n.customTools,n.toolBindings),e=>e.code==='INVALID_SERVER_RESPONSE'&&/functions.exec/.test(e.message)&&e.responseBody.toolFailure.callId==='alias_call');
 const arbitrary=normalizeDesktopRequest({input:'fixture',tools:[{type:'custom',name:'exec'},{type:'custom',name:'apply_patch'}]});
 for(const name of ['exec','apply_patch'])assert.throws(()=>desktopOutputItem({...call,name},arbitrary.customTools,arbitrary.toolBindings));
});

test('alternate provider names restore only a unique advertised custom tool in JSON and SSE',()=>{
 const normalized=normalizeDesktopRequest({input:'fixture',tools:[{type:'namespace',name:'functions',tools:[{type:'custom',name:'exec'}]}]},true);
 for(const name of ['functions__exec','exec','functions::exec','functions::functions__exec','functions__functions__exec']) {
  const call={type:'function_call',id:'fc',call_id:'call',name,arguments:'{"input":"text(1)"}'};
  const restored=desktopOutputItem(call,normalized.customTools,normalized.toolBindings);
  assert.equal(restored.type,'custom_tool_call');assert.equal(restored.name,'exec');assert.equal(restored.namespace,'functions');assert.equal(restored.input,'text(1)');
  const translate=createDesktopEventTranslator(normalized.customTools,normalized.toolBindings);
  assert.equal(translate({type:'response.output_item.added',output_index:0,item:{...call,arguments:''}})[0].item.type,'custom_tool_call');
  assert.equal(translate({type:'response.function_call_arguments.done',item_id:'fc',output_index:0,arguments:call.arguments}).at(-1).input,'text(1)');
 }
 const ambiguous=normalizeDesktopRequest({input:'fixture',tools:['a','b'].map(name=>({type:'namespace',name,tools:[{type:'custom',name:'exec'}]}))},true);
 for(const name of ['exec','invented'])assert.throws(()=>desktopOutputItem({type:'function_call',name,arguments:'{}'},ambiguous.customTools,ambiguous.toolBindings),e=>e.code==='INVALID_SERVER_RESPONSE');
});

test('missing tool result can resume with new instruction and cannot block a new session',async()=>{
 const requests=[];const tools=[{type:'namespace',name:'functions',tools:[{type:'custom',name:'exec'}]}];
 const {bridge,post}=await setup(async request=>{requests.push(structuredClone(request));return{contentType:'application/json',response:Response.json(response('r'+requests.length,requests.length===1?[{type:'function_call',id:'f',call_id:'c',name:'exec',arguments:'{"input":"text(1)"}'}]:[{type:'message',id:'m'+requests.length,role:'assistant',content:[{type:'output_text',text:'resumed'}]}]))}});
 try {
  const first=await post({input:'write fixture',tools},{session_id:'original'});assert.equal((await first.json()).output[0].type,'custom_tool_call');
  const independent=await post({input:'new fixture',tools},{session_id:'new'});assert.equal(independent.status,200);
  const continued=await post({input:'continue',tools},{session_id:'original'});assert.equal(continued.status,200);assert.equal((await continued.json()).output[0].content[0].text,'resumed');
  assert.equal(requests.length,3);assert.equal(requests[2].input.find(item=>item.call_id==='c'&&item.type==='function_call').name,'functions__exec');
  assert.match(requests[2].input.find(item=>item.call_id==='c'&&item.type==='function_call_output').output,/not received/);
  assert.equal((await post({input:'continue again',tools},{session_id:'original'})).status,200);assert.equal(requests.length,4);
 }finally{await bridge.stop()}
});

test('incremental sub-agent message stays attached to its tool continuation',async()=>{
 const requests=[];const message={type:'agent_message',id:'agent_msg',author:{agent_id:'child'},recipient:{agent_id:'parent'},content:'fixture completed',internal_chat_message_metadata_passthrough:{keep:true}};
 const {bridge,post}=await setup(async request=>{requests.push(structuredClone(request));return{contentType:'application/json',response:Response.json(response('r'+requests.length,requests.length===1?[{type:'function_call',call_id:'spawn',name:'spawn_agent',arguments:'{}'}]:[]))}});
 try {
  assert.equal((await post({input:'fixture',tools:[{type:'function',name:'spawn_agent'}]})).status,200);
  assert.equal((await post({input:[{type:'function_call_output',call_id:'spawn',output:'child started'},message]})).status,200);
  const envelope=requests[1].input.find(item=>item.role==='user'&&Array.isArray(item.content));
  assert.ok(envelope);assert.deepEqual(JSON.parse(envelope.content[0].text.split('\n').slice(1).join('\n')),message);
 }finally{await bridge.stop()}
});

test('full history repairs the original bare-name failed call and repeated user instructions resume',async()=>{
 const requests=[],tools=[{type:'namespace',name:'functions',tools:[{type:'custom',name:'exec'}]}];
 const rawCall={type:'function_call',id:'call-item',call_id:'history-call',name:'exec',arguments:'{"input":"text(1)"}'};
 const {bridge,post}=await setup(async request=>{requests.push(structuredClone(request));return{contentType:'application/json',response:Response.json(response('history'+requests.length,requests.length<3?[{...rawCall,call_id:requests.length===1?'history-call':'next-call'}]:[]))}});
 try {
  await (await post({input:[{role:'user',content:'fixture'}],tools},{session_id:'history'})).json();
  const history=[{role:'user',content:'fixture'},rawCall,{role:'user',content:'continue'}];
  assert.equal((await post({input:history,tools},{session_id:'history'})).status,200);
  assert.equal(requests[1].input.find(item=>item.call_id==='history-call'&&item.type==='function_call').name,'functions__exec');
  const cumulative=[...requests[1].input,{...rawCall,call_id:'next-call'},{role:'user',content:'continue'}];
  assert.equal((await post({input:cumulative,tools},{session_id:'history'})).status,200);assert.equal(requests.length,3);
  assert.ok(requests[2].input.some(item=>item.call_id==='next-call'&&item.type==='function_call_output'));
 }finally{await bridge.stop()}
});

test('truncated stream with a completed tool item can resume instead of remaining pending',async()=>{
 const requests=[],call={type:'function_call',id:'tool',call_id:'truncated',name:'functions__exec',arguments:'{"input":"text(1)"}'};
 const {bridge,post}=await setup(async request=>{requests.push(structuredClone(request));return requests.length===1?{contentType:'text/event-stream',response:splitStream([{type:'response.output_item.done',output_index:0,item:call}])}:{contentType:'application/json',response:Response.json(response('resumed'))}});
 try {
  const initial=await post({input:'fixture',stream:true,tools:[{type:'namespace',name:'functions',tools:[{type:'custom',name:'exec'}]}]},{session_id:'cancelled'});await initial.text();
  assert.equal((await post({input:'continue'},{session_id:'cancelled'})).status,200);assert.equal(requests.length,2);
  assert.match(requests[1].input.find(item=>item.call_id==='truncated'&&item.type==='function_call_output').output,/interrupted/);
 }finally{await bridge.stop()}
});

test('sub-agent notification cannot cancel another running tool in the same conversation',async()=>{
 const requests=[];
 const {bridge,post}=await setup(async request=>{requests.push(structuredClone(request));return{contentType:'application/json',response:Response.json(response('notify'+requests.length,requests.length===1?['a','b'].map(call_id=>({type:'function_call',call_id,name:'probe',arguments:'{}'})):[]))}});
 try {
  await (await post({input:'fixture',tools:[{type:'function',name:'probe'}]})).json();
  const partial=await post({input:[{type:'function_call_output',call_id:'a',output:'done'},{type:'agent_message',author:'child',recipient:'parent',content:'notification'}]});
  assert.equal(partial.status,409);assert.equal(requests.length,1);
  assert.equal((await post({input:[{type:'function_call_output',call_id:'b',output:'done'}]})).status,200);
  assert.equal(requests[1].input.filter(item=>item.type==='function_call_output').length,2);
  assert.ok(requests[1].input.some(item=>item.role==='user'&&Array.isArray(item.content)&&item.content[0].text.includes('notification')));
 }finally{await bridge.stop()}
});
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
 try{const stream=await post({input:'safe',stream:true,tools:[{type:'custom',name:'exec'}]});const text=await stream.text();const events=sseEvents(text);assert.equal(events.at(-1).type,'response.failed');assert.equal(events.at(-1).response.error.code,'INVALID_SERVER_RESPONSE');assert.match(events.at(-1).response.error.message,/工具「exec」.*JSON/);assert.doesNotMatch(text,/private unfinished|Unexpected end of JSON/);}finally{await bridge.stop()}
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

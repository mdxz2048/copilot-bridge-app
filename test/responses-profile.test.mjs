import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {normalizeDesktopRequest} from '../dist-electron/cloud/desktop-protocol.js';
import {ModelListSchema} from '../dist-electron/cloud/contract.js';
import {RemoteBridgeServer} from '../dist-electron/cloud/remote-bridge-server.js';
import {BridgeTrace} from '../dist-electron/cloud/bridge-trace.js';
import {requestShape,modifiedRequestFields} from '../dist-electron/cloud/request-diagnostics.js';
const result=(id,output=[])=>({id,object:'response',status:'completed',model:'logical',output,usage:{input_tokens:1,output_tokens:1,total_tokens:2}});
const tools=[{type:'namespace',name:'functions',tools:[{type:'custom',name:'exec',format:{type:'grammar',syntax:'lark',definition:'start: /[a-z]+/'}}]}];
const imageOutput=[{type:'input_text',text:'safe fixture'},{type:'input_image',image_url:'data:image/png;base64,c2FmZQ=='}];
async function setup(handler,profile='openai',trace){
 const mode={profile};const requests=[];
 const bridge=new RemoteBridgeServer({getMe:async()=>({id:'account'}),listModels:async()=>({data:[{id:'logical',capabilities:{nativeResponses:true,responsesProfile:mode.profile}}]}),createResponse:async(request,options)=>{requests.push({request:structuredClone(request),options});return handler(request,options,requests.length);}},0,undefined,undefined,undefined,{getApiKey:async()=>'key',getModel:async()=>'logical',getReasoning:async()=>'normal',trace});
 const status=await bridge.start();
 const post=(body,headers={})=>fetch(status.endpoint+'/v1/responses',{method:'POST',headers:{authorization:'Bearer key','content-type':'application/json',...headers},body:JSON.stringify({model:'desktop',...body})});
 return {bridge,post,requests,mode};
}
test('logical model capability declares explicit Responses profile with backward compatible default',()=>{
 const model={id:'logical',object:'model',owned_by:'test',capabilities:{tools:true,vision:true,reasoning:true,streaming:true,nativeResponses:true}};
 assert.equal(ModelListSchema.parse({object:'list',data:[model]}).data[0].capabilities.responsesProfile,'deepseek');
 assert.equal(ModelListSchema.parse({object:'list',data:[{...model,capabilities:{...model.capabilities,responsesProfile:'openai'}}]}).data[0].capabilities.responsesProfile,'openai');
 assert.equal(ModelListSchema.safeParse({object:'list',data:[{...model,capabilities:{...model.capabilities,responsesProfile:'guess'}}]}).success,false);
});
test('OpenAI profile transparently preserves tools, custom grammar, additional_tools, choice and content arrays',()=>{
 const raw={model:'logical',tools,input:[{type:'additional_tools',tools:[{type:'web_search'}]},{type:'custom_tool_call',namespace:'functions',name:'exec',id:'custom',call_id:'c',input:'run'},{type:'custom_tool_call_output',call_id:'c',output:imageOutput}],tool_choice:{type:'allowed_tools',mode:'auto',tools:[{type:'custom',name:'exec',namespace:'functions'}]},future:{enabled:true}};
 const normalized=normalizeDesktopRequest(raw,true,undefined,'openai');assert.deepEqual(normalized.request,raw);assert.deepEqual(normalized.transformations,[]);assert.equal(normalized.customTools.size,0);assert.equal(normalized.toolBindings.size,0);
});
test('DeepSeek retains only needed mutations and maps named namespace/custom tool_choice to function alias',()=>{
 const raw={model:'logical',input:[{type:'additional_tools',tools},{type:'custom_tool_call',namespace:'functions',name:'exec',id:'item',call_id:'c',input:'run'},{type:'custom_tool_call_output',call_id:'c',output:imageOutput}],tool_choice:{type:'custom',name:'exec',namespace:'functions'},instructions:'policy'};
 const normalized=normalizeDesktopRequest(raw,true,undefined,'deepseek');const request=normalized.request;
 assert.equal(request.tools[0].type,'function');assert.equal(request.tools[0].name,'functions__exec');assert.equal(request.input[0].type,'function_call');assert.equal(request.input[0].id,'item');assert.equal(request.input[0].arguments,'{"input":"run"}');assert.equal(request.input[1].type,'function_call_output');assert.deepEqual(request.input[1].output,imageOutput);assert.deepEqual(request.tool_choice,{type:'function',name:'functions__exec'});assert.equal(request.instructions,'policy');assert.ok(normalized.transformations.includes('tool_choice_alias'));
 const native=normalizeDesktopRequest({model:'logical',input:'x',tools:[{type:'custom',name:'apply_patch'}],tool_choice:{type:'custom',name:'apply_patch'}},true);assert.deepEqual(native.request.tools,[{type:'custom',name:'apply_patch'}]);assert.deepEqual(native.request.tool_choice,{type:'custom',name:'apply_patch'});
 assert.throws(()=>normalizeDesktopRequest({model:'logical',input:'x',tools,tool_choice:{type:'custom',name:'unknown'}},true),error=>error.code==='UNSUPPORTED_CAPABILITY'&&error.httpStatus===422);
 assert.throws(()=>normalizeDesktopRequest({model:'logical',input:'x',tools,tool_choice:{type:'allowed_tools',tools:[]}},true),error=>error.httpStatus===422);
});
test('OpenAI JSON custom roundtrip and image output continuation preserve semantics with exactly one POST per turn',async()=>{
 const call={type:'custom_tool_call',id:'native_item',call_id:'native_call',name:'exec',namespace:'functions',input:'safe-command'};
 const {bridge,post,requests}=await setup(async(request,options,count)=>({contentType:'application/json',response:Response.json(result('r'+count,count===1?[call]:[]))}));
 try{
  const input=[{type:'additional_tools',tools:[{type:'web_search'}]},{type:'message',role:'user',content:[{type:'input_text',text:'safe'},{type:'input_image',image_url:'data:image/png;base64,c2FmZQ=='}]}];
  const choice={type:'custom',name:'exec',namespace:'functions'};
  const first=await post({input,tools,tool_choice:choice});assert.equal(first.status,200);assert.deepEqual((await first.json()).output,[call]);assert.deepEqual(requests[0].request.input,input);assert.deepEqual(requests[0].request.tools,tools);assert.deepEqual(requests[0].request.tool_choice,choice);
  assert.equal((await post({input:[{type:'custom_tool_call_output',call_id:'native_call',output:imageOutput}]})).status,200);
  assert.deepEqual(requests[1].request.input.at(-1),{type:'custom_tool_call_output',call_id:'native_call',output:imageOutput});assert.deepEqual(requests[1].request.tools,tools);assert.equal(requests.length,2);assert.equal(requests[0].options.threadId,requests[1].options.threadId);
 }finally{await bridge.stop()}
});
test('DeepSeek wrapped output-only image continuation remains an array on the Cloud wire',async()=>{
 const call={type:'function_call',id:'wrapped',call_id:'wrapped_call',name:'functions__exec',arguments:'{"input":"safe"}'};
 const {bridge,post,requests}=await setup(async(request,options,count)=>({contentType:'application/json',response:Response.json(result('r'+count,count===1?[call]:[]))}),'deepseek');
 try{assert.equal((await post({input:'safe',tools})).status,200);assert.equal((await post({input:[{type:'custom_tool_call_output',call_id:'wrapped_call',output:imageOutput}]})).status,200);assert.deepEqual(requests[1].request.input.at(-1),{type:'function_call_output',call_id:'wrapped_call',output:imageOutput});assert.equal(requests.length,2);}finally{await bridge.stop()}
});
test('OpenAI native custom SSE events pass through without wrapper parsing or extra generation',async()=>{
 const call={type:'custom_tool_call',id:'native_item',call_id:'native_call',name:'exec',namespace:'functions',input:'safe-command'};
 const events=[{type:'response.output_item.added',sequence_number:1,output_index:0,item:{...call,input:'',status:'in_progress'}},{type:'response.custom_tool_call_input.delta',sequence_number:2,item_id:'native_item',output_index:0,delta:'safe-command'},{type:'response.custom_tool_call_input.done',sequence_number:3,item_id:'native_item',output_index:0,input:'safe-command'},{type:'response.output_item.done',sequence_number:4,output_index:0,item:call},{type:'response.completed',sequence_number:5,response:result('r_stream',[call])}];
 const {bridge,post,requests}=await setup(async()=>({contentType:'text/event-stream',response:new Response(events.map(event=>`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))}));
 try{const stream=await post({input:'safe',tools,stream:true});const text=await stream.text();const received=text.split('\n\n').flatMap(block=>{const data=block.split('\n').find(line=>line.startsWith('data: '));return data?[JSON.parse(data.slice(6))]:[]});assert.deepEqual(received,events);assert.equal(requests.length,1);}finally{await bridge.stop()}
});
test('profile change rejects before consuming pending calls or making another generation request',async()=>{
 const call={type:'function_call',id:'wrapped',call_id:'wrapped_call',name:'functions__exec',arguments:'{"input":"safe"}'};
 const {bridge,post,requests,mode}=await setup(async(request,options,count)=>({contentType:'application/json',response:Response.json(result('r'+count,count===1?[call]:[]))}),'deepseek');
 try{assert.equal((await post({input:'safe',tools})).status,200);mode.profile='openai';assert.equal((await post({input:[{type:'custom_tool_call_output',call_id:'wrapped_call',output:'ok'}]})).status,409);assert.equal(requests.length,1);mode.profile='deepseek';assert.equal((await post({input:[{type:'custom_tool_call_output',call_id:'wrapped_call',output:'ok'}]})).status,200);assert.equal(requests.length,2);}finally{await bridge.stop()}
});
test('safe diagnostic metadata contains stage timings, bytes and transformation counts without private content',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'bridge-profile-trace-'));await writeFile(join(directory,'capture.json'),JSON.stringify({captureBodies:true,expiresAt:new Date(Date.now()+60000).toISOString()}));
 const trace=new BridgeTrace(directory);const {bridge,post}=await setup(async()=>({contentType:'application/json',response:Response.json(result('r_trace'))}),'deepseek',trace);
 try{await post({input:[{role:'user',content:[{type:'input_text',text:'PRIVATE_DOCUMENT_CONTENT'},{type:'input_image',image_url:'data:image/png;base64,PRIVATE_IMAGE'}]}],tools});const text=await readFile(join(directory,'requests.jsonl'),'utf8');assert.doesNotMatch(text,/PRIVATE_DOCUMENT|PRIVATE_IMAGE/);const events=text.trim().split('\n').map(JSON.parse);const normalized=events.find(event=>event.stage==='request_normalized');assert.equal(normalized.responsesProfile,'deepseek');assert.equal(normalized.imageParts,1);assert.ok(normalized.bodyBytes>0);assert.equal(normalized.transformations.namespace_flatten,true);assert.equal(normalized.transformations.custom_function_wrapper,true);assert.equal(typeof normalized.timings.normalizeMs,'number');assert.equal(typeof events.find(event=>event.stage==='cloud_headers').cloudHeadersMs,'number');assert.equal(typeof events.find(event=>event.stage==='desktop_finished').totalMs,'number');assert.equal(normalized.modifiedFields.tools,true);assert.ok(JSON.stringify(normalized.requestShapeBefore).includes('namespace'));assert.ok(JSON.stringify(normalized.requestShapeAfter).includes('function'));}finally{await bridge.stop();await rm(directory,{recursive:true,force:true})}
});
test('request shapes expose known protocol changes without secret values or unknown field names',()=>{
 const raw={model:'logical',tools,input:[{type:'custom_tool_call',name:'exec',namespace:'functions',call_id:'c',input:'PRIVATE_COMMAND'},{type:'custom_tool_call_output',call_id:'c',output:imageOutput}],metadata:{PRIVATE_FIELD_NAME:'sk-PRIVATE_KEY'},instructions:'PRIVATE_POLICY'};
 const normalized=normalizeDesktopRequest(raw,true,undefined,'deepseek').request;
 const summary={requestShapeBefore:requestShape(raw),requestShapeAfter:requestShape(normalized),modifiedFields:modifiedRequestFields(raw,normalized)};
 const text=JSON.stringify(summary);assert.doesNotMatch(text,/PRIVATE_COMMAND|PRIVATE_FIELD_NAME|PRIVATE_KEY|PRIVATE_POLICY|c2FmZQ/);assert.match(text,/custom_tool_call/);assert.match(text,/function_call/);assert.equal(summary.modifiedFields.tools,true);assert.equal(summary.modifiedFields.input,true);assert.equal(summary.modifiedFields.metadata,undefined);
 const openai=normalizeDesktopRequest(raw,true,undefined,'openai').request;assert.deepEqual(modifiedRequestFields(raw,openai),{});assert.deepEqual(requestShape(raw),requestShape(openai));
 assert.deepEqual(modifiedRequestFields({input:[{type:'message',role:'user',content:'x'}]},{input:[{role:'user',content:'x',type:'message'}]}),{});
});
test('OpenAI request diagnostics show unchanged tools/input and no private tool result content',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'bridge-transparent-trace-'));const trace=new BridgeTrace(directory);
 const {bridge,post}=await setup(async()=>({contentType:'application/json',response:Response.json(result('r_openai'))}),'openai',trace);
 try{await post({tools,input:[{type:'message',role:'user',content:[{type:'input_text',text:'PRIVATE_OPENAI_TEXT'}]}],metadata:{PRIVATE_NAME:'PRIVATE_VALUE'}});const text=await readFile(join(directory,'requests.jsonl'),'utf8');assert.doesNotMatch(text,/PRIVATE_OPENAI_TEXT|PRIVATE_NAME|PRIVATE_VALUE/);const normalized=text.trim().split('\n').map(JSON.parse).find(event=>event.stage==='request_normalized');assert.equal(normalized.modifiedFields.input,undefined);assert.equal(normalized.modifiedFields.tools,undefined);const field=(shape,name)=>shape.fields.find(field=>field.name===name).shape;assert.deepEqual(field(normalized.requestShapeBefore,'input'),field(normalized.requestShapeAfter,'input'));assert.deepEqual(field(normalized.requestShapeBefore,'tools'),field(normalized.requestShapeAfter,'tools'));}finally{await bridge.stop();await rm(directory,{recursive:true,force:true})}
});

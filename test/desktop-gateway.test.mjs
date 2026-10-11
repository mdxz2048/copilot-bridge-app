import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesktopRequest, desktopOutputItem } from '../dist-electron/cloud/desktop-protocol.js';
import { RemoteBridgeServer } from '../dist-electron/cloud/remote-bridge-server.js';
import { ResponseRequestSchema } from '../dist-electron/cloud/contract.js';

test('gpt6 additional_tools are extracted and namespaced calls round trip', () => {
  const raw={model:'gpt-6.1-sol',input:[{type:'additional_tools',role:'developer',tools:[
    {type:'namespace',name:'functions',tools:[{type:'custom',name:'exec'}]},
    {type:'namespace',name:'clock',tools:[{type:'function',name:'sleep',parameters:{type:'object',properties:{duration_ms:{type:'number'}}}}]},
  ]},{type:'message',role:'user',content:'你好'},
  {type:'custom_tool_call',namespace:'functions',name:'exec',call_id:'c1',input:'text(42)'},
  {type:'function_call',namespace:'clock',name:'sleep',call_id:'c2',arguments:'{"duration_ms":1}'}]};
  assert.equal(ResponseRequestSchema.safeParse(raw).success,true);
  const normalized=normalizeDesktopRequest(raw);
  const parsed=ResponseRequestSchema.parse(normalized.request);
  assert.equal(parsed.input.length,3);
  assert.deepEqual(parsed.tools.map(t=>t.name),['functions__exec','clock__sleep']);
  assert.equal(parsed.input[1].name,'functions__exec');
  const custom=desktopOutputItem(parsed.input[1],normalized.customTools,normalized.toolBindings);
  assert.equal(custom.type,'custom_tool_call');assert.equal(custom.namespace,'functions');assert.equal(custom.name,'exec');assert.equal(custom.input,'text(42)');
  const fn=desktopOutputItem(parsed.input[2],normalized.customTools,normalized.toolBindings);
  assert.equal(fn.name,'sleep');assert.equal(fn.namespace,'clock');
});

test('namespace aliases remain distinct when tool names repeat', () => {
  const normalized=normalizeDesktopRequest({model:'test',input:[{role:'user',content:'hi'}],tools:[{type:'function',name:'a__run'},...['a','b'].map(name=>({type:'namespace',name,tools:[{type:'function',name:'run'}]}))]});
  const aliases=normalized.request.tools.map(t=>t.name);
  assert.equal(new Set(aliases).size,3);
  for(const alias of aliases){const restored=desktopOutputItem({type:'function_call',name:alias,arguments:'{}'},normalized.customTools,normalized.toolBindings);assert.equal(restored.name,normalized.toolBindings.get(alias).name);}
});

test('compressed native history does not fail Cloud input validation', () => {
  const raw = {model:'test',input:[{type:'compaction',encrypted_content:'provider-specific-history'},{type:'reasoning',summary:[]},{role:'user',content:'你好'}]};
  assert.equal(ResponseRequestSchema.safeParse(raw).success,true);
  const normalized=normalizeDesktopRequest(raw);
  assert.deepEqual(ResponseRequestSchema.parse(normalized.request).input,raw.input);
});

test('preserves custom editing tool input across the Cloud function boundary', () => {
  const patch='*** Begin Patch\n*** Add File: proof.txt\n+42\n*** End Patch';
  const normalized=normalizeDesktopRequest({model:'test',input:[{type:'message',role:'developer',content:'policy'},{type:'custom_tool_call',name:'apply_patch',call_id:'c1',input:patch},{type:'custom_tool_call_output',call_id:'c1',output:'done'}],tools:[{type:'custom',name:'apply_patch'}]});
  assert.equal(normalized.request.input[0].role,'developer');
  assert.equal(normalized.request.tools.length,1);
  assert.equal(normalized.request.input[2].type,'function_call_output');
  const restored=desktopOutputItem(normalized.request.input[1],normalized.customTools);
  assert.equal(restored.type,'custom_tool_call');assert.equal(restored.input,patch);
});
test('loopback gateway rejects missing tokens and browser origins', async () => {
  const bridge=new RemoteBridgeServer({getMe:async()=>({id:'test'})},0,undefined,undefined,undefined,{getApiKey:async()=> 'private-probe-token'});
  const status=await bridge.start();
  try{
    assert.equal((await fetch(status.endpoint+'/v1/models')).status,401);
    assert.equal((await fetch(status.endpoint+'/v1/models',{headers:{Authorization:'Bearer wrong'}})).status,401);
    assert.equal((await fetch(status.endpoint+'/v1/models',{headers:{Authorization:'Bearer private-probe-token',Origin:'https://example.test'}})).status,401);
  }finally{await bridge.stop()}
});

test('native Responses preserves unknown protocol semantics and custom tools', () => {
 const raw={model:'deepseek/test',input:[{type:'reasoning',encrypted_content:'opaque'},{type:'unknown_vendor_item',data:'preserve'}],instructions:'policy',tools:[{type:'custom',name:'apply_patch'}],previous_response_id:'resp_old',tool_choice:'required',parallel_tool_calls:false,text:{format:{type:'json_object'}},include:['reasoning.encrypted_content'],metadata:{test:'yes'},future_field:{shape:1}};
 assert.deepEqual(ResponseRequestSchema.parse(normalizeDesktopRequest(raw,true).request),{...raw,stream:false});
 assert.throws(()=>normalizeDesktopRequest({model:'x',input:'hi',tools:[{type:'web_search'}]}),/Unsupported tool/);
});

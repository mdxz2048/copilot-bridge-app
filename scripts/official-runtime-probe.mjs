import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile, readdir, stat, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const bin = join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
const candidates = await Promise.all((await readdir(bin)).map(async name => { const path = join(bin,name,'codex.exe'); try { return { path, time:(await stat(path)).mtimeMs }; } catch { return null; } }));
const runtime = process.env.COPILOT_BRIDGE_CODEX_RUNTIME ?? candidates.filter(Boolean).sort((a,b)=>b.time-a.time)[0]?.path;
if (!runtime) throw new Error('Official bundled Codex runtime not found');
const root = await mkdtemp(join(tmpdir(), 'bridge-official-fixture-'));
await mkdir(root, { recursive: true });
const requests = [];
const server = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  if (req.url !== '/v1/responses') { res.writeHead(404); res.end(); return; }
  const parsed = JSON.parse(body); requests.push(parsed);
  if (process.env.COPILOT_BRIDGE_PROBE_TOOL === '1' && requests.length === 1) {
    const item={type:'function_call',id:'fc_probe',call_id:'call_probe',name:'exec_command',arguments:JSON.stringify({cmd:"Write-Output 'BRIDGE-TOOL-PROBE-OK'",yield_time_ms:1000,max_output_tokens:128})};
    res.writeHead(200, {'content-type':'text/event-stream'});
    for (const [type,data] of [
      ['response.created',{response:{id:'resp_tool',object:'response',status:'in_progress',model:parsed.model,output:[]}}],
      ['response.output_item.added',{output_index:0,item:{...item,status:'in_progress',arguments:''}}],
      ['response.function_call_arguments.delta',{output_index:0,item_id:item.id,delta:item.arguments}],
      ['response.function_call_arguments.done',{output_index:0,item_id:item.id,arguments:item.arguments}],
      ['response.output_item.done',{output_index:0,item:{...item,status:'completed'}}],
      ['response.completed',{response:{id:'resp_tool',object:'response',status:'completed',model:parsed.model,output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}],
    ]) res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
    res.end(); return;
  }
  const item = { id: 'msg_probe', type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'BRIDGE-PROBE-OK', annotations: [] }] };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const [type, data] of [
    ['response.created', { response: { id: 'resp_probe', object: 'response', status: 'in_progress', model: parsed.model, output: [] } }],
    ['response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } }],
    ['response.content_part.added', { item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } }],
    ['response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: 'BRIDGE-PROBE-OK' }],
    ['response.output_text.done', { item_id: item.id, output_index: 0, content_index: 0, text: 'BRIDGE-PROBE-OK' }],
    ['response.output_item.done', { output_index: 0, item }],
    ['response.completed', { response: { id: 'resp_probe', object: 'response', status: 'completed', model: parsed.model, output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }],
  ]) res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const upstreamPort = server.address().port;
const { RemoteBridgeServer } = await import('../dist-electron/cloud/remote-bridge-server.js');
const bridge = new RemoteBridgeServer({ getMe:async()=>({id:'synthetic-fixture-account'}), listModels:async()=>({data:[{id:'gpt-5.5',capabilities:{nativeResponses:true}}]}), createResponse:async(body)=>({contentType:'text/event-stream',response:await fetch(`http://127.0.0.1:${upstreamPort}/v1/responses`,{method:'POST',body:JSON.stringify(body)})}) },0,undefined,undefined,undefined,{getApiKey:async()=>'local-probe-key',getModel:async()=>'gpt-5.5'});
const status = await bridge.start();
const port = new URL(status.endpoint).port;
await writeFile(join(root, 'helper.mjs'), 'process.stdout.write("local-probe-key")');
await writeFile(join(root, 'config.toml'), `model="gpt-5.5"\nmodel_provider="probe"\n[model_providers.probe]\nname="Probe"\nbase_url="http://127.0.0.1:${port}/v1"\nwire_api="responses"\nsupports_websockets=false\n[model_providers.probe.auth]\ncommand=${JSON.stringify(process.execPath)}\nargs=[${JSON.stringify(join(root, 'helper.mjs'))}]\n`);
const child = spawn(runtime, ['app-server', '--listen', 'stdio://'], { env: { ...process.env, CODEX_HOME: root }, windowsHide: true, stdio: 'pipe' });
let buffer = ''; const pending = new Map(); const events = []; let sequence = 0;
child.stderr.on('data', () => {});
child.stdout.on('data', chunk => { buffer += chunk; let end; while ((end = buffer.indexOf('\n')) >= 0) {
  const line = buffer.slice(0, end); buffer = buffer.slice(end+1); if (!line.trim()) continue;
  const message = JSON.parse(line); if (message.id != null) { const handler = pending.get(message.id); if (handler) { pending.delete(message.id); message.error ? handler.reject(new Error(JSON.stringify(message.error))) : handler.resolve(message.result); } }
  else events.push(message);
} });
const rpc = (method, params) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, params })+'\n'); });
const timer = setTimeout(() => { for (const handler of pending.values()) handler.reject(new Error('Runtime probe timed out')); child.kill(); }, 45000);
try {
  const init = await rpc('initialize', { clientInfo: { name: 'bridge_local_probe', version: '0.1.0' } });
  child.stdin.write(JSON.stringify({ method: 'initialized' })+'\n');
  const config = await rpc('config/read', { includeLayers: false });
  const thread = await rpc('thread/start', { cwd: root, model: 'gpt-5.5', modelProvider: 'probe', approvalPolicy: 'never', sandbox: 'read-only' });
  await rpc('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'Reply BRIDGE-PROBE-OK. This is a synthetic local protocol test.' }] });
  for (let i=0;i<180 && !events.some(e=>e.method==='turn/completed');i++) await new Promise(resolve=>setTimeout(resolve,200));
  // Only synthetic request; no user CODEX_HOME or credentials are read.
  await writeFile(join(root,'synthetic-request.json'), JSON.stringify(requests[0] ?? {},null,2));
  if (!requests.length || !events.some(e => e.method === 'turn/completed')) throw new Error('Runtime fixture did not complete');
  const toolOutputSeen=requests.some(request=>Array.isArray(request.input)&&request.input.some(item=>item.type==='function_call_output'&&String(item.output).includes('BRIDGE-TOOL-PROBE-OK')));
  if (process.env.COPILOT_BRIDGE_PROBE_TOOL === '1' && !toolOutputSeen) throw new Error('Official runtime did not return synthetic tool output');
  console.log(JSON.stringify({ toolOutputSeen, runtime, codexHome: init.codexHome, provider: config.config?.model_provider, requestCount: requests.length,
    tools: requests[0]?.tools?.map(tool=>({type:tool.type,name:tool.name, tools:tool.tools?.map(t=>({type:t.type,name:t.name}))})),
    roles: requests[0]?.input?.map(item=>item.role||item.type), completed: events.find(e=>e.method==='turn/completed')?.params?.turn?.status,
    response: events.filter(e=>e.method==='item/agentMessage/delta').map(e=>e.params.delta).join('') }, null, 2));
} finally { clearTimeout(timer); child.kill(); await bridge.stop(); server.closeAllConnections(); server.close(); }

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { UpdateManager } from '../dist-electron/update-manager.js';
import { parseInstallerMap, planDifferential } from '../dist-electron/differential-update.js';

const hash = data => createHash('sha256').update(data).digest('hex');
const block = n => Buffer.alloc(8192, n);
const old = Buffer.concat([Buffer.from('MZ'), block(1), block(2), block(3), block(4)]);
const next = Buffer.concat([Buffer.from('MZ'), block(3), block(2), block(5), block(1)]);
function blockmap(bytes) {
  const chunks = [bytes.subarray(0, 2)];
  for (let offset = 2; offset < bytes.length; offset += 8192) chunks.push(bytes.subarray(offset, offset + 8192));
  return gzipSync(JSON.stringify({version:'2',files:[{name:'file',offset:0,sizes:chunks.map(b=>b.length),checksums:chunks.map(b=>createHash('sha256').update(b).digest().subarray(0,18).toString('base64'))}]}));
}
const baseline = {version:'0.3.26',channel:'stable',platform:'windows',arch:'x64',downloadUrl:'https://ai.mddxz.top/api/v1/releases/files/old',sha256:hash(old)};
const release = {...baseline,version:'0.3.27',downloadUrl:'https://ai.mddxz.top/api/v1/releases/files/new',sha256:hash(next)};
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(),'bridge-diff-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  if (!options.noBaseline) await writeFile(join(directory,'CopilotBridge-0.3.26.exe'),options.badBaseline?Buffer.from('bad'):old);
  if (options.metadata) await writeFile(join(directory,'CopilotBridge-0.3.26.exe.json'),JSON.stringify(baseline));
  const requests = [], statuses = [];
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname; const range = new Headers(init?.headers).get('range'); requests.push({path,range});
    if (path.includes('by-version')) return Response.json({release:baseline});
    if (path.endsWith('/blockmap')) {
      if(options.mapFailure)return new Response('missing',{status:404});
      return new Response(blockmap(path.includes('/old/')?old:next));
    }
    if (range) {
      if(options.failure==='network')throw new TypeError('connection reset');
      if(options.failure==='status')return new Response(next);
      if(options.failure==='416')return new Response(null,{status:416});
      const match = /^bytes=(\d+)-(\d+)$/.exec(range); const start=Number(match[1]),end=Number(match[2]);
      let bytes = Buffer.from(next.subarray(start,end+1));
      if(options.failure==='corrupt')bytes[0]^=255;
      if(options.failure==='truncated')bytes=bytes.subarray(0,bytes.length-1);
      const headers={'content-range':`bytes ${start}-${end}/${next.length}`,etag:`"${release.sha256}"`};
      if(options.failure==='etag')headers.etag='"wrong"';
      if(options.failure==='range')headers['content-range']=`bytes ${start+1}-${end}/${next.length}`;
      if(options.failure==='idle') return new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,1));}}),{status:206,headers});
      return new Response(bytes,{status:206,headers});
    }
    return new Response(next,{headers:{'content-length':String(next.length)}});
  };
  const manager = new UpdateManager({currentVersion:'0.3.26',directory,baseUrl:'https://ai.mddxz.top',latest:async()=>release,
    changed:s=>statuses.push(s),fetch:fetcher,networkTimeouts:{connectMs:100,idleMs:50,totalMs:1000}});
  return {manager,directory,requests,statuses,fetcher};
}
test('reorders reusable blocks and downloads only new bytes, bootstrapping old updater cache without metadata',async t=>{
  const f=await fixture(t); assert.equal((await f.manager.check()).state,'READY');
  assert.deepEqual(await readFile(await f.manager.installer()),next);
  assert(f.requests.some(r=>r.path.includes('by-version')));
  assert.equal(f.requests.filter(r=>r.range).length,1);
  assert(!f.requests.some(r=>r.path.endsWith('/new')&&!r.range));
  assert.equal(f.statuses.filter(s=>s.downloadMode==='differential').at(-1).downloaded,8192);
  assert.equal(hash(await readFile(await f.manager.installer())),release.sha256);
  const count=f.requests.length; await f.manager.check(); assert.equal(f.requests.length,count);
});
test('uses persisted verified baseline without metadata network lookup',async t=>{
  const f=await fixture(t,{metadata:true});await f.manager.check();
  assert(!f.requests.some(r=>r.path.includes('by-version')));assert(f.requests.some(r=>r.range));
});
test('manual installation bootstraps the native NSIS installer cache without copying or modifying it',async t=>{
  const f=await fixture(t,{noBaseline:true});
  const nativeCache=join(f.directory,'native-installer.exe');await writeFile(nativeCache,old);
  const manager=new UpdateManager({currentVersion:'0.3.26',directory:f.directory,baseUrl:'https://ai.mddxz.top',installedInstaller:nativeCache,
    latest:async()=>release,changed:()=>{},fetch:f.fetcher});
  assert.equal((await manager.check()).state,'READY');assert(f.requests.some(r=>r.range));
  assert.deepEqual(await readFile(nativeCache),old);assert.deepEqual(await readFile(await manager.installer()),next);
  assert(!((await readdir(f.directory)).includes('CopilotBridge-0.3.26.exe')));
});
for(const failure of ['status','416','corrupt','truncated','etag','range','network','idle']) {
  test(`differential ${failure} automatically falls back to verified full download`,async t=>{
    const f=await fixture(t,{failure}); assert.equal((await f.manager.check()).state,'READY');
    assert(f.requests.some(r=>r.range));assert(f.requests.some(r=>r.path.endsWith('/new')&&!r.range));
    assert.deepEqual(await readFile(await f.manager.installer()),next);
    assert(!((await readdir(f.directory)).some(name=>name.endsWith('.part'))));
  });
}
for(const option of ['noBaseline','badBaseline','mapFailure']) {
  test(`${option} uses full download without range requests`,async t=>{
    const f=await fixture(t,{[option]:true});assert.equal((await f.manager.check()).state,'READY');
    assert(!f.requests.some(r=>r.range));assert.deepEqual(await readFile(await f.manager.installer()),next);
  });
}
test('rejects malformed/compressed-bomb maps and plans only changed blocks',()=>{
  for(const value of [{version:'1',files:[]},{version:'2',files:[{name:'file',offset:1,sizes:[2],checksums:['a'.repeat(24)]}]},
    {version:'2',files:[{name:'file',offset:0,sizes:[0],checksums:['a'.repeat(24)]}]}])assert.throws(()=>parseInstallerMap(gzipSync(JSON.stringify(value))));
  assert.throws(()=>parseInstallerMap(gzipSync(Buffer.alloc(17*1024*1024))));
  const plan=planDifferential(parseInstallerMap(blockmap(old)),parseInstallerMap(blockmap(next)));
  assert.equal(plan.filter(x=>x.source==='download').reduce((sum,x)=>sum+x.size,0),8192);
});
test('real HTTP transport reconstructs installer through Range requests and verifies final bytes',async t=>{
  const f=await fixture(t);let networkBytes=0;let ranges=0;
  const server=createServer((req,res)=>{
    if(req.url.includes('by-version')){res.setHeader('content-type','application/json');return res.end(JSON.stringify({release:baseline}));}
    if(req.url.endsWith('/blockmap'))return res.end(blockmap(req.url.includes('/old/')?old:next));
    const match=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range??'');
    if(!match){networkBytes+=next.length;return res.end(next);}
    ranges++;const start=Number(match[1]),end=Number(match[2]);const bytes=next.subarray(start,end+1);networkBytes+=bytes.length;
    res.writeHead(206,{'content-range':`bytes ${start}-${end}/${next.length}`,etag:`"${release.sha256}"`,'content-length':bytes.length});res.end(bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const manager=new UpdateManager({currentVersion:'0.3.26',directory:f.directory,baseUrl:'https://ai.mddxz.top',latest:async()=>release,changed:()=>{},
    fetch:(url,init)=>fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`,init)});
  assert.equal((await manager.check()).state,'READY');assert.deepEqual(await readFile(await manager.installer()),next);
  assert.equal(ranges,1);assert.equal(networkBytes,8192);
});

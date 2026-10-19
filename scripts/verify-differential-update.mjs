// Uses actual packaged NSIS bytes and real TCP Range responses. Does not execute installers.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile, stat, mkdtemp, rm, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {UpdateManager} from '../dist-electron/update-manager.js';
const [oldVersion,newVersion,evidenceFile]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+$/.test(oldVersion??'')||!/^\d+\.\d+\.\d+$/.test(newVersion??'')||!evidenceFile)throw Error('Usage: node scripts/verify-differential-update.mjs OLD NEW EVIDENCE.json');
const files={old:resolve(`release/Copilot Bridge Setup ${oldVersion}.exe`),new:resolve(`release/Copilot Bridge Setup ${newVersion}.exe`)};
async function digest(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
const oldHash=await digest(files.old),newHash=await digest(files.new),size=(await stat(files.new)).size;
const releases={old:{version:oldVersion,platform:'windows',arch:'x64',channel:'stable',downloadUrl:'https://ai.mddxz.top/api/v1/releases/files/old',sha256:oldHash},
  new:{version:newVersion,platform:'windows',arch:'x64',channel:'stable',downloadUrl:'https://ai.mddxz.top/api/v1/releases/files/new',sha256:newHash}};
const directory=await mkdtemp(join(tmpdir(),'bridge-real-diff-'));
let active='normal',metrics;
const server=createServer(async(req,res)=>{
  try{
    if(req.url.includes('/by-version/')){res.setHeader('content-type','application/json');return res.end(JSON.stringify({release:releases.old}));}
    const key=req.url.includes('/files/old')?'old':'new';
    if(req.url.endsWith('/blockmap')){const bytes=await readFile(files[key]+'.blockmap');metrics.mapBytes+=bytes.length;return res.end(bytes);}
    const range=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range??'');
    if(range){
      metrics.rangeRequests++;const start=Number(range[1]),end=Number(range[2]);metrics.differentialBytes+=end-start+1;
      res.writeHead(206,{'content-range':`bytes ${start}-${end}/${size}`,etag:`"${newHash}"`,'content-length':end-start+1});
      if(active==='corrupt'){const bytes=await readFile(files.new);bytes[start]^=255;return res.end(bytes.subarray(start,end+1));}
      return createReadStream(files.new,{start,end}).pipe(res);
    }
    metrics.fullRequests++;metrics.fullBytes+=size;res.setHeader('content-length',size);createReadStream(files.new).pipe(res);
  }catch(error){res.statusCode=500;res.end(String(error));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const results=[];
try{
  for(const scenario of ['normal','corrupt']){
    active=scenario;metrics={rangeRequests:0,differentialBytes:0,mapBytes:0,fullRequests:0,fullBytes:0};
    const targetDir=join(directory,scenario);await mkdir(targetDir);
    const modes=new Set();const started=Date.now();
    const updater=new UpdateManager({currentVersion:oldVersion,directory:targetDir,baseUrl:'https://ai.mddxz.top',installedInstaller:files.old,
      latest:async()=>releases.new,changed:s=>{if(s.downloadMode)modes.add(s.downloadMode);},
      fetch:(url,init)=>fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`,init)});
    const status=await updater.check();
    if(status.state!=='READY')throw Error(`${scenario}: ${JSON.stringify(status)}`);
    const actualHash=await digest(await updater.installer());
    if(actualHash!==newHash||!metrics.rangeRequests||(scenario==='normal'&&metrics.fullRequests)||(scenario==='corrupt'&&metrics.fullRequests!==1))throw Error(`Invalid outcome ${scenario}`);
    results.push({scenario,state:status.state,sha256:actualHash,expectedSha256:newHash,size,...metrics,modes:[...modes],elapsedMs:Date.now()-started});
  }
  const report={oldVersion,newVersion,transport:'real loopback HTTP; trusted HTTPS URL mapped to isolated server',executedInstaller:false,results};
  await mkdir(dirname(resolve(evidenceFile)),{recursive:true});await writeFile(evidenceFile,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}

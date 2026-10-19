import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const output=resolve(process.env.UI_CAPTURE_DIR??'work/ui-main-layout');
await mkdir(output,{recursive:true});
await build({entryPoints:['test/fixtures/main-layout-renderer.tsx'],bundle:true,outfile:resolve(output,'fixture.js'),jsx:'automatic',format:'iife'});
// File assets remain inside the checkout. Capture only fake account data and never launch official clients.
await writeFile(resolve(output,'index.html'),`<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="${new URL('../src/style.css',import.meta.url).href}"></head><body><div id="app"></div><script src="fixture.js"></script></body></html>`);
const childEnvironment={...process.env};
delete childEnvironment.ELECTRON_RUN_AS_NODE;
for(const scale of (process.env.UI_CAPTURE_SCALES??'1,1.25,1.5,2').split(',')){
 const code=await new Promise((done,reject)=>{
  const child=spawn(require('electron'),['--no-sandbox',`--force-device-scale-factor=${scale}`,resolve('test/main-layout-electron.cjs')],{windowsHide:true,env:{...childEnvironment,UI_SCALE:scale,UI_CAPTURE_DIR:output,UI_FIXTURE_HTML:resolve(output,'index.html')},stdio:'inherit'});
  child.on('error',reject);child.on('exit',done);
 });
 if(code!==0)throw new Error(`Electron capture at DPR ${scale} failed (${code})`);
}

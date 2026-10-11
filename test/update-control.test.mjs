import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const bundle=await build({entryPoints:['src/components/UpdateControl.tsx'],bundle:true,format:'cjs',jsx:'automatic',platform:'node',packages:'external',write:false});
const component={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);
const {UpdateControl}=component.exports;
async function mount(initial={state:'CURRENT'},{read,install}={}){
 const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'});
 const prior={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 let handler,checks=0,installs=0,unsubscribed=false;
 window.copilotBridge={getUpdateStatus:read??(async()=>initial),onUpdateStatus:callback=>{handler=callback;return()=>{unsubscribed=true;};},checkForUpdates:async()=>{checks++;},installUpdate:async()=>{installs++;if(install)await install();}};
 const React=await import('react'),{createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('app'));
 await React.act(async()=>root.render(React.createElement(UpdateControl)));
 return {get button(){return document.querySelector('button');},get checks(){return checks;},get installs(){return installs;},get document(){return dom.window.document;},async emit(next){await React.act(async()=>handler(next));},async click(){await React.act(async()=>document.querySelector('button').click());},async act(fn){await React.act(fn);},async dispose(){await React.act(async()=>root.unmount());assert.equal(unsubscribed,true);dom.window.close();Object.assign(globalThis,prior);}};
}
test('corner update icon checks manually; READY click installs once without checking or confirmation',async()=>{
 const app=await mount();try{
  assert.equal(app.button.textContent,'');assert.match(app.button.getAttribute('aria-label'),/检查升级/);
  await app.click();assert.equal(app.checks,1);
  await app.emit({state:'READY',version:'0.3.1'});assert.match(app.button.title,/点击立即安装/);
  assert.equal(app.document.querySelector('[role="dialog"]'),null);
  await app.click();assert.equal(app.installs,1);assert.equal(app.checks,1);
 }finally{await app.dispose();}
});
test('download progress uses bytes/total and unknown total never exposes invented percentage',async()=>{
 const app=await mount({state:'DOWNLOADING',version:'0.3.1',downloaded:25,total:100});try{
  assert.equal(app.button.disabled,true);assert.match(app.button.title,/25%/);
  assert.equal(app.document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'25');
  assert.equal(app.document.querySelector('.update-ring-value').getAttribute('stroke-dashoffset'),'75');
  await app.emit({state:'DOWNLOADING',version:'0.3.1',downloaded:1048576});
  assert.match(app.button.title,/1.0 MB/);assert.ok(!app.button.title.includes('%'));
  assert.equal(app.document.querySelector('[role="progressbar"]').hasAttribute('aria-valuenow'),false);
  assert.ok(app.document.querySelector('.update-ring-unknown'));
 }finally{await app.dispose();}
});
test('installation failures show tooltip and retry checks; pending action ignores duplicate clicks',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const app=await mount({state:'READY',version:'0.3.1'},{install:async()=>{await pending;throw Error('无法启动安装程序');}});try{
  await app.click();assert.equal(app.button.disabled,true);await app.click();assert.equal(app.installs,1);
  await app.act(async()=>{finish();await pending;});
  assert.match(app.button.title,/无法启动安装程序/);assert.equal(app.button.disabled,false);
  await app.click();assert.equal(app.checks,1);
 }finally{await app.dispose();}
});
test('live READY event wins against an older initial status read',async()=>{
 let resolve;const read=new Promise(done=>{resolve=done;});
 const app=await mount(undefined,{read:()=>read});try{
  await app.emit({state:'READY',version:'0.3.1'});
  await app.act(async()=>resolve({state:'CURRENT'}));
  assert.match(app.button.title,/0.3.1/);
 }finally{await app.dispose();}
});

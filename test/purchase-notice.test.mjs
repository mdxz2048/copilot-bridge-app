import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const source=await build({entryPoints:['src/components/PurchaseNotice.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false});
const mod={exports:{}};new Function('require','module','exports',source.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
test('purchase notice survives failed acknowledgement, refreshes balance and ignores a signed-out account response',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://bridge.example.test',pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {act,createElement}=await import('react'),{createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 const item={id:'fixture',orderNo:'ORDER-123456',status:'APPROVED',attempt:1,creditedRmb:20.25},client={list:async()=>({data:[item]}),ack:async()=>{throw Error('offline');}};let refreshed=0;
 await act(async()=>{root.render(createElement(mod.exports.PurchaseNotice,{client,onReviewed:()=>refreshed++}));});assert.match(document.body.textContent,/20.25 已到账/);assert.equal(refreshed,1);
 await act(async()=>{document.querySelector('button').click();});assert.match(document.body.textContent,/暂时未能确认/);assert.match(document.body.textContent,/ORDER-123456/);
 client.ack=async()=>({ok:true});await act(async()=>{document.querySelector('button').click();});assert.equal(document.querySelector('section'),null);
 let resolve;const delayed={list:()=>new Promise(r=>{resolve=r;}),ack:async()=>{}};
 await act(async()=>{root.render(createElement(mod.exports.PurchaseNotice,{key:'old',client:delayed,onReviewed:()=>{throw Error('stale balance update');}}));});
 await act(async()=>{root.render(createElement(mod.exports.PurchaseNotice,{key:'new',client:{list:async()=>({data:[]}),ack:async()=>{}},onReviewed:()=>{}}));resolve({data:[item]});});assert.equal(document.querySelector('section'),null);
 await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;
});

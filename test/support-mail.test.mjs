import assert from 'node:assert/strict';import test from 'node:test';
import {SupportMail} from '../dist-electron/cloud/support-mail.js';
const owner='11111111-1111-4111-8111-111111111111';
test('draft includes current user, original failure time, error and IDs without sending mail',()=>{
 const support=new SupportMail();support.record({ownerUserId:owner,occurredAt:'2026-10-22T07:35:38.000Z',error:{code:'DEVICE_PROOF_INVALID',message:'设备校验失败'},requestId:'request_fixture',traceId:'trace_fixture'});
 const url=new URL(support.draft(owner,'0.3.28'));assert.equal(url.protocol,'mailto:');assert.equal(url.pathname,'zhipeng2048@gmail.com');
 const body=url.searchParams.get('body');for(const part of [owner,'2026/10/22','15:35:38','北京时间','DEVICE_PROOF_INVALID','设备校验失败','request_fixture','trace_fixture','0.3.28'])assert.ok(body.includes(part),part);
 assert.ok(!decodeURIComponent(support.draft('another-user','0.3.28')).includes('DEVICE_PROOF_INVALID'));
});
test('visible error takes precedence and secret-like text is removed with a Windows-sized URI',()=>{
 const support=new SupportMail();const uri=support.draft(owner,'0.3.28',{message:'password="PRIVATE_PASSWORD" Bearer PRIVATE_BEARER sk-PRIVATEKEY123456 '+ '中文😀'.repeat(800),occurredAt:'2026-10-22T07:00:00Z',code:'SYNTHETIC'});
 assert.ok(uri.length<1900,uri.length);const decoded=decodeURIComponent(uri);for(const secret of ['PRIVATE_PASSWORD','PRIVATE_BEARER','PRIVATEKEY123456'])assert.ok(!decoded.includes(secret));assert.ok(decoded.includes(owner));assert.ok(decoded.includes('SYNTHETIC'));assert.ok(decoded.includes('内容已截短'));
 assert.throws(()=>support.draft(owner,'0.3.28',{message:'x',occurredAt:'invalid',to:'attacker@example.test'}));
});

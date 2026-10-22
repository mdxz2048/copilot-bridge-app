import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import test from 'node:test';
import {SavedLogins} from '../dist-electron/cloud/saved-logins.js';
const key=randomBytes(32);
const encryption={isEncryptionAvailable:()=>true,encryptString(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(value),c.final(),c.getAuthTag()]);},decryptString(bytes){const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(-16));return Buffer.concat([d.update(bytes.subarray(12,-16)),d.final()]).toString();}};
test('saved accounts persist encrypted, are origin scoped, update independently, and never list passwords',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bridge-saved-logins-'));try{
 const file=join(dir,'accounts.enc'),store=new SavedLogins(file,'https://fixture.test',encryption);
 assert.deepEqual(await store.list(),[]);await Promise.all([store.save(' FIRST@example.test ','fixture-password-first'),store.save('second@example.test','fixture-password-second')]);
 assert.deepEqual((await store.list()).map(a=>a.email),['second@example.test','first@example.test']);
 const bytes=await readFile(file);assert.equal(bytes.includes('fixture-password'),false);assert.equal(bytes.includes('example.test'),false);
 const reopened=new SavedLogins(file,'https://fixture.test',encryption);assert.deepEqual(await reopened.get(' FIRST@example.test '),{email:'first@example.test',password:'fixture-password-first'});
 assert.equal(JSON.stringify(await reopened.list()).includes('password'),false);await reopened.save('first@example.test','updated-fixture-password');assert.equal((await reopened.get('first@example.test')).password,'updated-fixture-password');
 await reopened.forget('FIRST@example.test');assert.equal(await reopened.get('first@example.test'),null);assert.equal((await reopened.list()).length,1);
 await assert.rejects(new SavedLogins(file,'https://other.test',encryption).list(),/无法解密/);
 await assert.rejects(new SavedLogins(file,'https://fixture.test',{...encryption,isEncryptionAvailable:()=>false}).save('third@example.test','fixture'),/安全存储/);assert.equal((await reopened.list()).length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

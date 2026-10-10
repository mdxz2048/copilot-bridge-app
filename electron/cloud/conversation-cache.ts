import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RemoteConversation } from './remote-bridge-server.js';
import { InputItemSchema } from './contract.js';
export class ConversationCache {
  readonly path:string;
  private readonly encryption:{isEncryptionAvailable():boolean;encryptString(s:string):Buffer;decryptString(b:Buffer):string};
  constructor(path:string,encryption:ConversationCache['encryption']){this.path=path;this.encryption=encryption;}
  load(accountId:string):RemoteConversation[]{
    try{
      if(!this.encryption.isEncryptionAvailable()||!existsSync(this.path)||statSync(this.path).size>20*1024*1024)return[];
      const data=JSON.parse(this.encryption.decryptString(readFileSync(this.path)));
      if(data.accountId!==accountId||data.version!==1||Date.parse(data.expiresAt)<Date.now()||!Array.isArray(data.items))return[];
      return data.items.slice(-8).map((c:RemoteConversation&{toolBindings?:[string,unknown][];customTools?:string[]})=>({
        threadId:String(c.threadId),input:c.input.map(item=>InputItemSchema.parse(item)),tools:c.tools,
        customTools:new Set(c.customTools??[]),toolBindings:new Map(c.toolBindings??[]),
      })) as RemoteConversation[];
    }catch{return[];}
  }
  save(conversations:RemoteConversation[],accountId:string){
    try{
      if(!this.encryption.isEncryptionAvailable())return;
      const items=conversations.slice(-8).map(c=>({...c,traceId:undefined,customTools:[...(c.customTools??[])],toolBindings:[...(c.toolBindings??[])]}));
      const text=JSON.stringify({version:1,accountId,expiresAt:new Date(Date.now()+86400000).toISOString(),items});
      if(Buffer.byteLength(text)>19*1024*1024)return;
      mkdirSync(dirname(this.path),{recursive:true});writeFileSync(this.path+'.tmp',this.encryption.encryptString(text),{mode:0o600});renameSync(this.path+'.tmp',this.path);
    }catch{/* Cache failure never blocks requests. */}
  }
}

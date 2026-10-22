import {z} from "zod";
import {randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile,rename,stat} from "node:fs/promises";
import {dirname} from "node:path";

export const RequestStatsSchema=z.object({
  bodyBytes:z.number().int().nonnegative(),declaredBodyBytes:z.number().int().nonnegative().optional(),bodyLimitBytes:z.number().int().nonnegative().optional(),
  inputCount:z.number().int().nonnegative().optional(),toolDefinitionCount:z.number().int().nonnegative().optional(),toolCallCount:z.number().int().nonnegative().optional(),
  toolOutputCount:z.number().int().nonnegative().optional(),toolArgumentBytes:z.number().int().nonnegative().optional(),toolOutputBytes:z.number().int().nonnegative().optional(),
});
export type RequestStats=z.infer<typeof RequestStatsSchema>;
/** Counts from the original request, before diagnostic excerpt limits. No text is returned. */
export function requestStats(value:unknown,bodyBytes:number):RequestStats {
  const request=value&&typeof value==="object"?value as Record<string,unknown>:{};
  const input=Array.isArray(request.input)?request.input:request.input===undefined?[]:[request.input];
  let toolCallCount=0,toolOutputCount=0,toolArgumentBytes=0,toolOutputBytes=0;
  const bytes=(item:unknown)=>item===undefined?0:Buffer.byteLength(typeof item==="string"?item:JSON.stringify(item));
  for(const raw of input){if(!raw||typeof raw!=="object")continue;const item=raw as Record<string,unknown>;
    if(item.type==="function_call"||item.type==="custom_tool_call"){toolCallCount++;toolArgumentBytes+=bytes(item.arguments??item.input);}
    if(item.type==="function_call_output"||item.type==="custom_tool_call_output"){toolOutputCount++;toolOutputBytes+=bytes(item.output);}
  }
  return {bodyBytes,inputCount:input.length,toolDefinitionCount:Array.isArray(request.tools)?request.tools.length:0,toolCallCount,toolOutputCount,toolArgumentBytes,toolOutputBytes};
}
export const FailureFeedbackSchema=z.object({
  id:z.uuid(),ownerUserId:z.uuid(),occurredAt:z.iso.datetime(),appVersion:z.string().max(40),traceId:z.string().max(200),
  requestId:z.string().max(200).optional(),responseId:z.string().max(200).optional(),threadId:z.string().max(200).optional(),
  stage:z.enum(["local_validation","cloud_http","cloud_transport","stream_failed","stream_incomplete","stream_disconnected"]),
  error:z.object({code:z.string().max(100),message:z.string().max(4096),httpStatus:z.number().int().optional()}),
  request:z.object({desktop:z.unknown().optional(),forwarded:z.unknown().optional()}),
  requestStats:z.object({desktop:RequestStatsSchema.optional(),forwarded:RequestStatsSchema.optional()}).optional(),
  reply:z.object({http:z.unknown().optional(),events:z.array(z.unknown()).optional()}),truncated:z.boolean().optional(),
});
export type FailureFeedback=z.infer<typeof FailureFeedbackSchema>;
export const FailureFeedbackResultSchema=z.object({id:z.uuid(),received:z.literal(true),duplicate:z.boolean()});
const MAX_REPORT=96*1024,MAX_OUTBOX=2*1024*1024,TTL=7*86400000;
const credentialKey=/(?:authorization|cookie|password|passwd|secret|credential|(?:api|access|refresh)[_-]?key|api[_-]?token|access[_-]?token|refresh[_-]?token|dpop|jwt|private[_-]?key)|^(?:key|token)$/i;
const binaryKey=/^(?:file_data|file_url|image_url|image_data|audio|audio_data|video|binary|base64|encrypted_content|encrypted_reasoning|b64_json)$/i;

function redactText(value:string):string {
  // Bound BEFORE regex processing: V8 can exhaust its regexp stack on a huge
  // continuous token. Start a retained tail on a complete line, never in a secret.
  if(value.length>16384){
    const tailStart=value.length-12288,newline=value.indexOf("\n",tailStart);
    value=value.slice(0,4096)+"\n[TRUNCATED_MIDDLE]\n"+(newline>=0?value.slice(newline+1):"[OMITTED_PARTIAL_LINE]");
  }
  return value.replace(/\bsk-[A-Za-z0-9_-]{6,}/g,"[REDACTED_KEY]")
    .replace(/\bBearer\s+[^\s"',;]+/gi,"Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,"[REDACTED_JWT]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|cookie|authorization|secret)["']?\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,"$1[REDACTED]")
    .replace(/data:[^\s"']+/gi,"[OMITTED_DATA]")
    .replace(/https?:\/\/[^\s"'<>]+/gi,match=>{try{const url=new URL(match);url.search="";url.hash="";url.username="";url.password="";return url.toString();}catch{return "[OMITTED_URL]";}})
    .replace(/[A-Za-z0-9+/=_-]{512,}/g,"[OMITTED_BINARY_OR_OPAQUE]");
}

/** User-authorized failure excerpts only. Never use this for ordinary trace logging. */
export function sanitizeFailure(value:unknown,limit=MAX_REPORT):{value:unknown;truncated:boolean} {
  let budget=limit,truncated=false;
  const visit=(item:unknown,key="",depth=0):unknown=>{
    if(credentialKey.test(key))return "[REDACTED]";
    if(binaryKey.test(key)||Buffer.isBuffer(item)||ArrayBuffer.isView(item)||item instanceof ArrayBuffer)return "[OMITTED_BINARY]";
    if(depth>=12||budget<=64){truncated=true;return "[TRUNCATED]";}
    if(typeof item==="string"){
      // Arguments / tool outputs often contain JSON strings with nested credentials.
      if(/^[\s]*[\[{]/.test(item)&&item.length<512*1024){try{return JSON.stringify(visit(JSON.parse(item),"",depth+1));}catch{}}
      if(item.length>16384)truncated=true;
      const text=redactText(item);const remaining=Math.min(8192,Math.floor(budget/4));
      if(text.length>remaining)truncated=true;
      const head=Math.floor(remaining/4),result=text.length>remaining?text.slice(0,head)+"[TRUNCATED_MIDDLE]"+text.slice(-Math.max(1,remaining-head)):text;budget-=Buffer.byteLength(result)+16;return result;
    }
    if(Array.isArray(item)){if(item.length>64)truncated=true;const recent=item.slice(-64).reverse().map(child=>visit(child,"",depth+1)).reverse();return [...(item.length>64?[{omittedItems:item.length-64}]:[]),...recent];}
    if(item&&typeof item==="object"){
      const entries=Object.entries(item);if(entries.length>64)truncated=true;
      return Object.fromEntries(entries.slice(0,64).map(([name,child])=>{budget-=Buffer.byteLength(name)+8;return [redactText(name).slice(0,100),visit(child,name,depth+1)];}));
    }
    budget-=16;return item??null;
  };
  const result=visit(value);if(Buffer.byteLength(JSON.stringify(result))>limit){return {value:{omitted:"failure excerpt exceeded size limit"},truncated:true};}return {value:result,truncated};
}

export class FailureCapture {
  private readonly report:FailureFeedback;
  private emitted=false;
  constructor(ownerUserId:string,appVersion:string,traceId:string){this.report={id:randomUUID(),ownerUserId,appVersion,traceId,occurredAt:new Date().toISOString(),stage:"local_validation",error:{code:"LOCAL_ERROR",message:"Request failed"},request:{},reply:{events:[]}};}
  request(which:"desktop"|"forwarded",value:unknown){try{const safe=sanitizeFailure(value,20*1024);this.report.request[which]=safe.value;this.report.truncated ||= safe.truncated;}catch{this.report.request[which]={omitted:"diagnostic excerpt unavailable"};this.report.truncated=true;}}
  stats(which:"desktop"|"forwarded",value:RequestStats){try{this.report.requestStats??={};this.report.requestStats[which]=RequestStatsSchema.parse(value);}catch{this.report.truncated=true;}}
  association(values:{requestId?:string|null;responseId?:string|null;threadId?:string|null}){for(const name of ["requestId","responseId","threadId"] as const)if(values[name])this.report[name]=values[name]!.slice(0,200);}
  http(value:unknown){try{const safe=sanitizeFailure(value,8*1024);this.report.reply.http=safe.value;this.report.truncated ||= safe.truncated;}catch{this.report.reply.http={omitted:"diagnostic excerpt unavailable"};this.report.truncated=true;}}
  event(value:unknown){try{const safe=sanitizeFailure(value,8*1024);const events=this.report.reply.events!;events.push(safe.value);this.report.truncated ||= safe.truncated;while(events.length>32||Buffer.byteLength(JSON.stringify(events))>28*1024){events.shift();this.report.truncated=true;}}catch{this.report.truncated=true;}}
  failure(stage:FailureFeedback["stage"],error:unknown):FailureFeedback|null {
    if(this.emitted)return null;this.emitted=true;
    this.report.occurredAt=new Date().toISOString();
    try{
    const data=error&&typeof error==="object"?error as {code?:unknown;message?:unknown;httpStatus?:number;requestId?:string;responseBody?:unknown}:{};
    this.association({requestId:data.requestId});if(data.responseBody!==undefined)this.http(data.responseBody);
    this.report.stage=stage;this.report.error={code:typeof data.code==="string"?redactText(data.code).slice(0,100):"LOCAL_ERROR",message:redactText(typeof data.message==="string"?data.message:"Request failed").slice(0,4096),...(data.httpStatus?{httpStatus:data.httpStatus}:{})};
    return FailureFeedbackSchema.parse(this.report);
    }catch{
      const safe=FailureFeedbackSchema.safeParse({...this.report,stage,request:{},reply:{},requestStats:undefined,truncated:true,error:{code:"DIAGNOSTIC_CAPTURE_ERROR",message:"Failure details unavailable."}});
      return safe.success?safe.data:null;
    }
  }
}

interface Encryption {isEncryptionAvailable():boolean;encryptString(value:string):Buffer;decryptString(value:Buffer):string}
interface QueueItem {report:FailureFeedback;attempts:number;nextAt:number}
interface OutboxOptions {path:string;encryption:Encryption;owner:()=>string|null;upload:(report:FailureFeedback)=>Promise<unknown>;now?:()=>number}
export class FailureFeedbackOutbox {
  private items:QueueItem[]=[];
  private loaded=false;
  private loading:Promise<void>|undefined;
  private writing:Promise<void>=Promise.resolve();
  private inFlight=false;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private closed=false;
  private readonly seen=new Set<string>();
  private readonly options:OutboxOptions;
  constructor(options:OutboxOptions){this.options=options;}
  private now(){return this.options.now?.()??Date.now();}
  enqueue(report:FailureFeedback):void {
    if(this.closed)return;
    // Defer disk work and networking until after the normal model path yields.
    setImmediate(()=>{void this.add(report).catch(()=>{});});
  }
  private async load(){if(this.closed||this.loaded)return;this.loading??=(async()=>{try{if(!this.options.encryption.isEncryptionAvailable()||(await stat(this.options.path)).size>MAX_OUTBOX+64*1024)return;const data=JSON.parse(this.options.encryption.decryptString(await readFile(this.options.path)));if(data.version!==1||!Array.isArray(data.items)||this.closed)return;this.items=data.items.slice(-20).flatMap((entry:QueueItem)=>{const parsed=FailureFeedbackSchema.safeParse(entry.report);return parsed.success?[{report:parsed.data,attempts:Number.isSafeInteger(entry.attempts)?Math.max(0,Math.min(20,entry.attempts)):0,nextAt:Number.isFinite(entry.nextAt)?entry.nextAt:0}]:[]});this.trim();await this.persist();}catch{}finally{this.loaded=true;}})();await this.loading;}
  private trim(){const previous=this.items.length;this.items=this.items.filter(item=>Date.parse(item.report.occurredAt)>this.now()-TTL);while(this.items.length>20||Buffer.byteLength(JSON.stringify(this.items))>MAX_OUTBOX)this.items.shift();return previous!==this.items.length;}
  private async persist(){try{if(this.closed||!this.options.encryption.isEncryptionAvailable())return;this.trim();const encrypted=this.options.encryption.encryptString(JSON.stringify({version:1,items:this.items}));if(encrypted.byteLength>MAX_OUTBOX+64*1024)return;this.writing=this.writing.then(async()=>{if(this.closed)return;await mkdir(dirname(this.options.path),{recursive:true});await writeFile(this.options.path+'.tmp',encrypted,{mode:0o600});await rename(this.options.path+'.tmp',this.options.path);}).catch(()=>{});await this.writing;}catch{}}
  private async add(report:FailureFeedback){if(this.closed)return;await this.load();if(this.closed||this.seen.has(report.traceId)||this.items.some(item=>item.report.traceId===report.traceId))return;this.seen.add(report.traceId);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value!);const safe=sanitizeFailure(FailureFeedbackSchema.parse(report),MAX_REPORT);const checked=FailureFeedbackSchema.parse({...safe.value as Record<string,unknown>,truncated:report.truncated||safe.truncated});if(Buffer.byteLength(JSON.stringify(checked))>MAX_REPORT)return;this.items.push({report:checked,attempts:0,nextAt:0});this.trim();await this.persist();void this.flush();}
  async flush():Promise<void>{
    await this.load();if(this.closed||this.inFlight)return;this.inFlight=true;
    try{if(this.trim())await this.persist();const owner=this.options.owner();if(!owner)return;for(const item of [...this.items]){if(item.report.ownerUserId!==owner||item.nextAt>this.now())continue;if(this.closed||this.options.owner()!==owner)break;
      try{await this.options.upload(item.report);if(this.closed)return;this.items=this.items.filter(value=>value!==item);}catch(error){if(this.closed)return;const status=error&&typeof error==="object"&&"httpStatus" in error?Number(error.httpStatus):0;if([400,403,409,413,422].includes(status))this.items=this.items.filter(value=>value!==item);else{item.attempts++;item.nextAt=this.now()+Math.min(3600000,5000*2**Math.min(item.attempts-1,10));} }await this.persist();}
    }finally{this.inFlight=false;this.schedule();}
  }
  private schedule(){if(this.closed)return;clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},30000);this.timer.unref();}
  start(){void this.flush().catch(()=>{});}
  stop(){this.closed=true;clearTimeout(this.timer);}
  async close():Promise<void>{this.stop();await this.loading;await this.writing;}
}

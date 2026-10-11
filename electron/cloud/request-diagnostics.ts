// Never include user-defined field names or string values in protocol shape logs.
import { isDeepStrictEqual } from "node:util";
const knownFields=new Set(["model","input","instructions","tools","tool_choice","parallel_tool_calls","reasoning","text","previous_response_id","include","metadata","max_output_tokens","stream","temperature","top_p","top_logprobs","max_tool_calls","conversation","store","background","prompt","truncation","service_tier","safety_identifier","prompt_cache_key","prompt_cache_retention","context_management","stream_options","type","role","content","arguments","output","name","namespace","call_id","id","status","parameters","properties","required","additionalProperties","format","mode","effort","summary","encrypted_content","reasoning_content","image_url","file_id","file_data","file_url","detail","description","syntax","definition"]);
const protocolTypes=new Set(["message","function","custom","namespace","function_call","function_call_output","custom_tool_call","custom_tool_call_output","reasoning","compaction","item_reference","additional_tools","input_text","output_text","input_image","input_file","reasoning_text","text","json_object","json_schema","grammar","web_search","file_search","code_interpreter","computer_use","mcp","allowed_tools"]);
const roles=new Set(["system","developer","user","assistant"]);
export type RequestShape={type:string;length?:number;protocolType?:string;protocolRole?:string;fields?:Array<{name:string;shape:RequestShape}>;items?:RequestShape[];unknownFieldCount?:number;omittedItems?:number;depthLimited?:boolean};
export function requestShape(value:unknown,depth=0):RequestShape {
  if(value===null)return {type:"null"};
  if(Array.isArray(value))return {type:"array",length:value.length,...(depth<8?{items:value.slice(0,32).map(item=>requestShape(item,depth+1)),...(value.length>32?{omittedItems:value.length-32}:{})}:{depthLimited:true})};
  if(typeof value!=="object")return {type:typeof value,...(typeof value==="string"?{length:value.length}:{})};
  if(depth>=8)return {type:"object",depthLimited:true};
  const entries=Object.entries(value as Record<string,unknown>);
  const item=value as Record<string,unknown>;
  return {type:"object",...(typeof item.type==="string"?{protocolType:protocolTypes.has(item.type)?item.type:"unknown"}:{}),...(typeof item.role==="string"?{protocolRole:roles.has(item.role)?item.role:"unknown"}:{}),fields:entries.filter(([key])=>knownFields.has(key)).sort(([a],[b])=>a.localeCompare(b)).map(([name,field])=>({name,shape:requestShape(field,depth+1)})),unknownFieldCount:entries.filter(([key])=>!knownFields.has(key)).length};
}
export function modifiedRequestFields(before:unknown,after:unknown):Record<string,boolean>{
  const original=before&&typeof before==="object"?before as Record<string,unknown>:{};
  const forwarded=after&&typeof after==="object"?after as Record<string,unknown>:{};
  return Object.fromEntries([...new Set([...Object.keys(original),...Object.keys(forwarded)])].filter(key=>knownFields.has(key)&&!isDeepStrictEqual(original[key],forwarded[key])).map(key=>[key,true]));
}
export function safeModifiedFields(value:unknown):Record<string,boolean>{
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([name,changed])=>knownFields.has(name)&&typeof changed==="boolean"));
}
export function safeProtocolEnum(value:unknown,key:string):string|undefined{
  if(typeof value!=="string")return undefined;
  if(key==="protocolType"&&(protocolTypes.has(value)||value==="unknown"))return value;
  if(key==="protocolRole"&&(roles.has(value)||value==="unknown"))return value;
  return undefined;
}

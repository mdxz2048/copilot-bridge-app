import { CloudError } from "./cloud-error.js";
import type { ResponseRequest } from "./contract.js";

/** Normalize the official runtime wire shape before the frozen Cloud function contract. */
export type DesktopToolBinding = { name: string; namespace?: string; custom: boolean };
export type ResponsesProfile = "deepseek" | "openai";
export function normalizeDesktopRequest(value: unknown, native = false, context?: { input: Record<string, unknown>[]; toolBindings?: Map<string, DesktopToolBinding> }, profile: ResponsesProfile = "deepseek"): { request: ResponseRequest; customTools: Set<string>; toolBindings: Map<string, DesktopToolBinding>; transformations: string[] } {
  if (!value || typeof value !== "object") throw new Error("Invalid Desktop request");
  const raw = value as Record<string, unknown>;
  const customTools = new Set<string>();
  const toolBindings = new Map<string, DesktopToolBinding>();
  const transformations = new Set<string>();
  if(profile==="openai")return {request:raw as ResponseRequest,customTools,toolBindings,transformations:[]};
  const tools: Record<string, unknown>[] = [];
  const addTools = (values: unknown[], namespace?: string): void => {
    for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const tool = value as Record<string, unknown>;
    if (tool.type === "namespace" && typeof tool.name === "string" && Array.isArray(tool.tools)) {
      transformations.add("namespace_flatten");
      addTools(tool.tools, namespace ? `${namespace}.${tool.name}` : tool.name); continue;
    }
    if ((tool.type !== "function" && tool.type !== "custom") || typeof tool.name !== "string") { if (native) { tools.push(tool); continue; } throw new CloudError("UNSUPPORTED_CAPABILITY", `Unsupported tool type: ${String(tool.type)}`, { httpStatus: 422 }); }
    const existing = [...toolBindings].find(([, binding]) => binding.name === tool.name && binding.namespace === namespace);
    const candidate = namespace ? `${namespace.replace(/[^a-zA-Z0-9_-]/g, "_")}__${tool.name}` : tool.name;
    const name = existing?.[0] ?? (candidate.length <= 64 && !toolBindings.has(candidate) ? candidate : `bridge_tool_${toolBindings.size}`);
    toolBindings.set(name, { name: tool.name, namespace, custom: tool.type === "custom" });
    if (existing) continue;
    if (tool.type === "function") { tools.push({ ...tool, name }); continue; }
    if (native && tool.name === "apply_patch" && !namespace) { tools.push(tool); continue; }
    if (tool.type === "custom" && typeof tool.name === "string") {
      customTools.add(name);
      transformations.add("custom_function_wrapper");
      tools.push({ type: "function", name, description: `${tool.description ?? ""}\nSupply the tool's raw input in the input field.`,
        parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"], additionalProperties: false } });
    }
    }
  };
  if (Array.isArray(raw.tools)) addTools(raw.tools);
  if (Array.isArray(raw.input)) for (const value of raw.input) {
    if (value && typeof value === "object" && (value as Record<string, unknown>).type === "additional_tools") {
      const item = value as Record<string, unknown>;
      if (!Array.isArray(item.tools)) throw new Error("additional_tools 缺少工具定义。");
      addTools(item.tools);
      transformations.add("additional_tools_promoted");
    }
  }
  const callName = (item: Record<string, unknown>): unknown => {
    const bindings=new Map([...(context?.toolBindings??[]),...toolBindings]);
    const exact=[...bindings].find(([,binding])=>binding.name===item.name&&binding.namespace===item.namespace);
    return exact?.[0]??resolveDesktopTool(String(item.name),bindings)?.[0]??item.name;
  };
  const input = Array.isArray(raw.input) ? raw.input.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new CloudError("VALIDATION_ERROR", "Invalid input item.", { httpStatus: 400 });
    const item = value as Record<string, unknown>;
    if (item.type === "additional_tools") return [];
    if (item.type === "agent_message") {
      transformations.add("agent_message_envelope");
      return [{ type: "message", role: "user", content: [{ type: "input_text", text: `Sub-agent message (author and recipient retained):\n${JSON.stringify(item)}` }] }];
    }
    if (item.type === "function_call") { const {namespace:_namespace,...rest}=item;return [{ ...rest, name: callName(item) }]; }
    if (native && item.type === "custom_tool_call" && item.name === "apply_patch" && !item.namespace) return [item];
    if (item.type === "custom_tool_call") { transformations.add("custom_call_wrapper");const {input:_input,namespace:_namespace,...rest}=item;return [{ ...rest, type: "function_call", name: callName(item), arguments: JSON.stringify({ input: item.input }) }]; }
    if (native && item.type === "custom_tool_call_output") {
      const call = [...(Array.isArray(raw.input) ? raw.input : []), ...(context?.input ?? [])].find(value => value && typeof value === "object" && ["custom_tool_call", "function_call"].includes(String(value.type)) && value.call_id === item.call_id);
      if (!call || (call.type === "custom_tool_call" && call.name === "apply_patch" && !call.namespace)) return [item];
    }
    if (item.type === "custom_tool_call_output") { transformations.add("custom_output_wrapper");return [{ ...item, type: "function_call_output",
      output: native || typeof item.output === "string" ? item.output : JSON.stringify(item.output) }]; }
    return [item];
  }) : raw.input;
  let toolChoice=raw.tool_choice;
  if(toolChoice&&typeof toolChoice==="object"){
    const choice=toolChoice as Record<string,unknown>;
    if(!["function","custom"].includes(String(choice.type))||typeof choice.name!=="string")throw new CloudError("UNSUPPORTED_CAPABILITY","该资源不支持此工具选择格式。",{httpStatus:422});
    const matches=[...new Map([...(context?.toolBindings??[]),...toolBindings])].filter(([alias,binding])=>alias===choice.name||(binding.name===choice.name&&(choice.namespace===undefined||binding.namespace===choice.namespace)));
    if(matches.length!==1)throw new CloudError("UNSUPPORTED_CAPABILITY","工具选择未匹配唯一的已声明工具。",{httpStatus:422});
    const [alias,binding]=matches[0]!;
    const {namespace:_namespace,...rest}=choice;
    const type=native&&binding.custom&&binding.name==="apply_patch"&&!binding.namespace?"custom":"function";
    toolChoice={...rest,type,name:alias};
    if(alias!==choice.name||type!==choice.type||choice.namespace!==undefined)transformations.add("tool_choice_alias");
  }
  return { request: { ...raw, tools: tools.length ? tools : undefined, input, ...(toolChoice!==undefined?{tool_choice:toolChoice}:{}) } as ResponseRequest, customTools, toolBindings, transformations:[...transformations] };
}

/** Accept alternate spellings only when they identify exactly one advertised tool. */
export function resolveDesktopTool(name: string, bindings?: Map<string, DesktopToolBinding>): [string, DesktopToolBinding] | undefined {
  if (!bindings?.size) return undefined;
  const exact = bindings.get(name);
  if (exact) return [name, exact];
  const matches = [...bindings].filter(([, binding]) => name === binding.name ||
    (binding.namespace && [
      `${binding.namespace}::${binding.name}`, `${binding.namespace}.${binding.name}`,
      `${binding.namespace}__${binding.name}`, `${binding.namespace}::${binding.namespace}__${binding.name}`,
      `${binding.namespace}__${binding.namespace}__${binding.name}`,
    ].includes(name)));
  if (matches.length !== 1) throw new CloudError("INVALID_SERVER_RESPONSE", "模型返回的工具名称未匹配唯一的已声明工具，请重试。", { httpStatus: 502 });
  return matches[0];
}

export function desktopOutputItem(value: unknown, customTools: Set<string>, toolBindings?: Map<string, DesktopToolBinding>): unknown {
  if (!value || typeof value !== "object") return value;
  const item = value as Record<string, unknown>;
  if (item.type !== "function_call") return item;
  const match = resolveDesktopTool(String(item.name), toolBindings);
  const binding = match?.[1];
  const restored = binding ? { ...item, name: binding.name, ...(binding.namespace ? { namespace: binding.namespace } : {}) } : item;
  if (!customTools.has(match?.[0] ?? String(item.name))) return restored;
  const args = customArguments(item.arguments);
  const { arguments: _arguments, ...rest } = restored;
  return { ...rest, type: "custom_tool_call", input: args.input };
}

function customArguments(value: unknown): { input: string } {
  try { const args=JSON.parse(String(value));if(args&&typeof args.input==="string")return args; } catch { /* Never expose partial arguments or provider text in errors. */ }
  throw new CloudError("INVALID_SERVER_RESPONSE", "Cloud returned invalid custom tool arguments.", { httpStatus: 502 });
}

// Decode only complete characters from the wrapper's JSON string, retaining split
// escapes in the buffer. The surrounding function JSON is never sent to Desktop.
function partialCustomInput(buffer: string): string {
  const prefix=/^\s*\{\s*"input"\s*:\s*"/.exec(buffer);if(!prefix)return "";
  let result="";
  for(let i=prefix[0].length;i<buffer.length;i++){
    const char=buffer[i];if(char==='"')break;
    if(char!=="\\"){result+=char;continue;}
    const count=buffer[i+1]==="u"?6:2;if(i+count>buffer.length)break;
    try{result+=JSON.parse(`"${buffer.slice(i,i+count)}"`);}catch{throw new CloudError("INVALID_SERVER_RESPONSE","Cloud returned invalid custom tool arguments.",{httpStatus:502});}
    i+=count-1;
  }
  // Hold a high surrogate until its low surrogate arrives in a later delta.
  // A final genuinely unpaired surrogate remains representable at arguments.done.
  return /[\uD800-\uDBFF]$/.test(result)?result.slice(0,-1):result;
}

/** One translator per SSE response: call IDs and argument buffers never cross streams. */
export function createDesktopEventTranslator(customTools: Set<string>, toolBindings?: Map<string, DesktopToolBinding>): (value: unknown) => unknown[] {
  type Pending={buffer:string;emitted:string;done:boolean};
  const calls=new Map<string,Pending>();
  return value=>{
    if(!value||typeof value!=="object")return [value];
    const event=value as Record<string,unknown>, item=event.item as Record<string,unknown>|undefined;
    const match=item?.type==="function_call"?resolveDesktopTool(String(item.name),toolBindings):undefined;
    const isCustom=customTools.has(match?.[0]??String(item?.name));
    const keys=[event.item_id??item?.id].filter(v=>v!==undefined).map(v=>`id:${String(v)}`);
    if(event.output_index!==undefined)keys.push(`index:${String(event.output_index)}`);
    if(event.type==="response.output_item.added"&&item?.type==="function_call"&&isCustom){
      const state={buffer:String(item.arguments??""),emitted:"",done:false};for(const key of keys)calls.set(key,state);
      const binding=match?.[1];const {arguments:_arguments,...rest}=item;
      return [{...event,item:{...rest,type:"custom_tool_call",name:binding?.name??item.name,...(binding?.namespace?{namespace:binding.namespace}:{}),input:""}}];
    }
    const state=keys.map(key=>calls.get(key)).find(Boolean);
    if(state&&!state.done&&event.type==="response.output_item.done"&&item?.type==="function_call"&&isCustom){
      const input=customArguments(item.arguments).input;
      if(!input.startsWith(state.emitted))throw new CloudError("INVALID_SERVER_RESPONSE","Cloud changed streamed custom tool input.",{httpStatus:502});
      const delta=input.slice(state.emitted.length);state.emitted=input;state.done=true;
      const {item:_item,...rest}=event;
      return [...(delta?[{...rest,type:"response.custom_tool_call_input.delta",item_id:item.id,delta}]:[]),{...rest,type:"response.custom_tool_call_input.done",item_id:item.id,input},desktopEvent(value,customTools,toolBindings)];
    }
    if(state&&(event.type==="response.function_call_arguments.delta"||event.type==="response.function_call_arguments.done")){
      const done=event.type.endsWith(".done");
      if(done)state.buffer=typeof event.arguments==="string"?event.arguments:state.buffer;else state.buffer+=String(event.delta??"");
      const decoded=done?customArguments(state.buffer).input:partialCustomInput(state.buffer);
      if(!decoded.startsWith(state.emitted))throw new CloudError("INVALID_SERVER_RESPONSE","Cloud changed streamed custom tool input.",{httpStatus:502});
      const delta=decoded.slice(state.emitted.length);state.emitted=decoded;
      const {arguments:_arguments,delta:_delta,...rest}=event;
      const result:unknown[]=delta?[{...rest,type:"response.custom_tool_call_input.delta",delta}]:[];
      if(done&&!state.done){result.push({...rest,type:"response.custom_tool_call_input.done",input:decoded});state.done=true;}
      return result;
    }
    return [desktopEvent(value,customTools,toolBindings)];
  };
}

export function desktopEvent(value: unknown, customTools: Set<string>, toolBindings?: Map<string, DesktopToolBinding>): unknown {
  if (!value || typeof value !== "object") return value;
  const event = value as Record<string, unknown>;
  const response = event.response as Record<string, unknown> | undefined;
  return { ...event, ...(event.item ? { item: desktopOutputItem(event.item, customTools, toolBindings) } : {}),
    ...(response ? { response: { ...response, ...(Array.isArray(response.output) ? { output: response.output.map(item => desktopOutputItem(item, customTools, toolBindings)) } : {}) } } : {}) };
}

import { ZodError } from "zod";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  InputItemSchema,
  OutputItemSchema,
  ResponseRequestSchema,
  ResponseSchema,
  type InputItem,
  type OutputItem,
  type ResponseRequest,
} from "./contract.js";
import type { CloudClient } from "./cloud-client.js";
import { CloudError } from "./cloud-error.js";
import { requestShape, modifiedRequestFields } from "./request-diagnostics.js";
import { normalizeDesktopRequest, createDesktopEventTranslator, desktopOutputItem, resolveDesktopTool, type DesktopToolBinding, type ResponsesProfile } from "./desktop-protocol.js";
import { FailureCapture, requestStats, type FailureFeedback } from "./failure-feedback.js";

interface FailureContext {capture:FailureCapture;stage:FailureFeedback["stage"];userAborted:boolean}

export interface RemoteConversation {
  traceId?: string;
  toolBindings?: Map<string, DesktopToolBinding>;
  customTools?: Set<string>;
  threadId: string;
  input: InputItem[];
  tools: Record<string, unknown>[];
  sessionKey?: string;
  responseIds?: string[];
  responseHistory?: Record<string, InputItem[]>;
  model?: string;
  reasoningMode?: string;
  responsesProfile?: ResponsesProfile;
}

export interface CloudResponseSettlementTarget {
  responseId: string | null;
  requestId: string | null;
  recovery: boolean;
}

interface StreamLifecycle {
  responseId: string | null;
  requestId: string | null;
  completed: boolean;
  translate: (value: unknown) => unknown[];
  started: number;
  receivedBytes: number;
  eventCount: number;
  firstEvent: boolean;
  firstText: boolean;
  feedback?:FailureContext;
}
interface GatewayOptions {
  cache?: {load(accountId:string):RemoteConversation[];save(items:RemoteConversation[],accountId:string):void};
  trace?: {write(stage:string,traceId:string,metadata:Record<string,unknown>,body?:unknown):void};
  getApiKey: () => Promise<string | null>;
  getModel?: () => Promise<string | null>;
  getReasoning?: () => Promise<string | null>;
  failureFeedback?: {appVersion:string;ownerUserId?:()=>string|null;submit:(report:FailureFeedback)=>void};
}

export interface RemoteBridgeStatus {
  state: "stopped" | "starting" | "ready" | "failed";
  message: string;
  endpoint: string;
}

export class RemoteBridgeServer {
  private readonly gatewayOptions?: GatewayOptions;
  private readonly client: CloudClient;
  private readonly onCloudError?: (error: unknown) => void;
  private readonly getProviderConnectionId?: () => Promise<string | null>;
  private readonly onResponseSettlement?: (
    target: CloudResponseSettlementTarget,
  ) => Promise<void> | void;
  private readonly port: number;
  private cacheAccountId = "";
  private readonly historyCalls = new Map<string, RemoteConversation>();
  private readonly sessions = new Map<string, RemoteConversation>();
  private readonly responses = new Map<string, RemoteConversation>();
  private readonly calls = new Map<string, RemoteConversation>();
  private server: Server | null = null;
  private status: RemoteBridgeStatus;

  constructor(
    client: CloudClient,
    port = 8787,
    onCloudError?: (error: unknown) => void,
    getProviderConnectionId?: () => Promise<string | null>,
    onResponseSettlement?: (
      target: CloudResponseSettlementTarget,
    ) => Promise<void> | void,
    gatewayOptions?: GatewayOptions,
  ) {
    this.client = client;
    this.gatewayOptions = gatewayOptions;
    this.port = port;
    this.onCloudError = onCloudError;
    this.getProviderConnectionId = getProviderConnectionId;
    this.onResponseSettlement = onResponseSettlement;
    this.status = {
      state: "stopped",
      message: "Cloud Bridge 未启动",
      endpoint: `http://127.0.0.1:${String(port)}`,
    };
  }

  getStatus(): RemoteBridgeStatus {
    return this.status;
  }

  async start(): Promise<RemoteBridgeStatus> {
    if (this.server) return this.status;
    this.status = {
      ...this.status,
      state: "starting",
      message: "正在启动 Cloud Bridge…",
    };
    try {
      const account=await this.client.getMe();
      this.cacheAccountId=account.id;
      for(const conversation of this.gatewayOptions?.cache?.load(account.id)??[]) {
        if (conversation.sessionKey) this.sessions.set(conversation.sessionKey, conversation);
        for (const id of conversation.responseIds ?? []) this.responses.set(id, conversation);
        const completed=new Set(conversation.input.filter(item=>"type" in item&&["function_call_output", "custom_tool_call_output"].includes(String(item.type))).map(item=>String(item.call_id)));
        for(const item of conversation.input) if("type" in item&&["function_call", "custom_tool_call"].includes(String(item.type))) {this.historyCalls.set(String(item.call_id),conversation);if(!completed.has(String(item.call_id)))this.calls.set(String(item.call_id),conversation);}
      }
      const server = createServer((request, response) => {
        void this.handle(request, response);
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.port, "127.0.0.1", () => resolve());
      });
      this.server = server;
      const activePort = serverPort(server);
      this.status = {
        endpoint: `http://127.0.0.1:${String(activePort ?? this.port)}`,
        state: "ready",
        message: "Cloud Bridge 正常",
      };
    } catch (error) {
      this.status = {
        ...this.status,
        state: "failed",
        message: error instanceof Error ? error.message : "Cloud Bridge 启动失败",
      };
    }
    return this.status;
  }

  async stop(): Promise<RemoteBridgeStatus> {
    this.persistConversations();
    const server = this.server;
    this.server = null;
    this.calls.clear();
    this.historyCalls.clear();
    this.responses.clear();
    this.sessions.clear();
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      });
    }
    this.status = {
      ...this.status,
      state: "stopped",
      message: "Cloud Bridge 未启动",
    };
    return this.status;
  }

  async restart(): Promise<RemoteBridgeStatus> {
    await this.stop();
    return this.start();
  }

  async models(): Promise<Array<{
    id: string;
    availability?: "READY" | "SETUP_REQUIRED" | "UNAVAILABLE";
    statusMessage?: string;
    supportsReasoningEffort: boolean;
    reasoningModes: Array<"normal" | "thinking" | "auto">;
    defaultReasoningMode: "normal" | "thinking" | "auto";
  }>> {
    const models = await this.client.listModels();
    return models.data.map((model) => ({
      id: model.id,
      availability: model.availability,
      statusMessage: model.statusMessage,
      supportsReasoningEffort: model.capabilities.reasoning,
      reasoningModes: model.capabilities.reasoningModes,
      defaultReasoningMode: model.capabilities.defaultReasoningMode,
    }));
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const traceId = randomUUID();
    const started=performance.now();
    let feedback:FailureContext|undefined;
    response.setHeader("X-Bridge-Trace-Id", traceId);
    response.once("finish", () => this.gatewayOptions?.trace?.write("desktop_finished",traceId,{status:response.statusCode,totalMs:Math.round(performance.now()-started)}));
    try {
      const url = new URL(request.url ?? "/", this.status.endpoint);
      this.gatewayOptions?.trace?.write("desktop_received",traceId,{method:request.method,path:url.pathname});
      if (url.pathname !== "/health" && this.gatewayOptions) {
        const key = await this.gatewayOptions.getApiKey();
        const expected = Buffer.from(`Bearer ${key ?? ""}`);
        const actual = Buffer.from(request.headers.authorization ?? "");
        if (!key || actual.length !== expected.length || !timingSafeEqual(actual, expected) || request.headers.origin) {
          sendJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Local Bridge credential required" } });
          return;
        }
      }
      if (request.method === "GET" && url.pathname === "/health") {
        await this.client.getMe();
        sendJson(response, 200, {
          status: "ok",
          message: "Cloud Bridge ready",
          protocolVersion: 3,
        });
        return;
      }
      if (
        request.method === "GET"
        && (url.pathname === "/bridge/models" || url.pathname === "/v1/models")
      ) {
        const models = await this.client.listModels();
        sendJson(
          response,
          200,
          url.pathname === "/bridge/models"
            ? {
                data: models.data.map((model) => ({
                  id: model.id,
                  supportsReasoningEffort: model.capabilities.reasoning,
      reasoningModes: model.capabilities.reasoningModes,
      defaultReasoningMode: model.capabilities.defaultReasoningMode,
                })),
              }
            : models,
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/responses") {
        const reporting=this.gatewayOptions?.failureFeedback;
        const owner=reporting?.ownerUserId?reporting.ownerUserId():this.cacheAccountId;
        if(reporting&&owner)feedback={capture:new FailureCapture(owner,reporting.appVersion,traceId),stage:"local_validation",userAborted:false};
        await this.handleResponse(request, response, traceId,feedback);
        return;
      }
      sendJson(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
          requestId: randomUUID(),
        },
      });
    } catch (error) {
      if(feedback&&request.aborted)feedback.userAborted=true;
      this.reportFailure(feedback,error instanceof CloudError&&error.httpStatus&&feedback?.stage==="cloud_transport"?"cloud_http":feedback?.stage??"local_validation",error);
      this.gatewayOptions?.trace?.write("request_failed",traceId,{code:error instanceof CloudError?error.code:"LOCAL_ERROR",message:error instanceof Error?error.message:"Unknown error"});
      this.onCloudError?.(error);
      sendCloudError(response, error);
    }
  }

  private async handleResponse(
    incoming: IncomingMessage,
    outgoing: ServerResponse,
    traceId: string,
    feedback?:FailureContext,
  ): Promise<void> {
    const started=performance.now();let bodyBytes=0;
    const declared=Number(incoming.headers["content-length"]);
    const declaredStats=Number.isSafeInteger(declared)&&declared>=0?{declaredBodyBytes:declared}:{};
    const raw = await readJson(incoming,bytes=>{bodyBytes=bytes;feedback?.capture.stats("desktop",{bodyBytes:bytes,bodyLimitBytes:LOCAL_BODY_LIMIT,...declaredStats});});
    feedback?.capture.request("desktop",raw);
    feedback?.capture.stats("desktop",{...requestStats(raw,bodyBytes),bodyLimitBytes:LOCAL_BODY_LIMIT,...declaredStats});
    const parseMs=Math.round(performance.now()-started);
    this.gatewayOptions?.trace?.write("desktop_request",traceId,{sessionId:incoming.headers["session_id"],conversationId:incoming.headers["conversation_id"],model:(raw as Record<string, unknown>).model,stream:(raw as Record<string, unknown>).stream,previousResponseId:(raw as Record<string, unknown>).previous_response_id,reasoning:(raw as Record<string, unknown>).reasoning},raw);
    const selectedModel = (await this.gatewayOptions?.getModel?.()) ?? String((raw as Record<string, unknown>).model);
    const modelStarted=performance.now();
    if(feedback&&this.gatewayOptions?.getModel)feedback.stage="cloud_http";
    const models = this.gatewayOptions?.getModel ? await this.client.listModels() : { data: [] };
    if(feedback)feedback.stage="local_validation";
    const modelLookupMs=Math.round(performance.now()-modelStarted);
    const catalogModel=models.data.find(model => model.id === selectedModel);
    if(this.gatewayOptions?.getModel&&!catalogModel)throw new CloudError("MODEL_NOT_ALLOWED","当前模型已停用或权限已调整，请选择其他模型并新建会话。",{httpStatus:403});
    if(catalogModel?.availability&&catalogModel.availability!=="READY")throw new CloudError("MODEL_UNAVAILABLE",catalogModel.statusMessage??"所选模型暂不可用，请联系管理员。",{httpStatus:503});
    const capabilities=catalogModel?.capabilities;
    const profile=capabilities?.responsesProfile??"deepseek";
    const rawRequest=raw as Record<string,unknown>;
    const sessionKey = [incoming.headers["conversation_id"], incoming.headers["session_id"]].find(value => typeof value === "string" && value.length <= 200) as string | undefined;
    const sessionOwner = sessionKey ? this.sessions.get(sessionKey) : undefined;
    const context=typeof rawRequest.previous_response_id==="string"?this.responses.get(rawRequest.previous_response_id):Array.isArray(rawRequest.input)?rawRequest.input.map(item=>item&&typeof item==="object"&&typeof item.call_id==="string"?this.calls.get(item.call_id)??this.historyCalls.get(item.call_id):undefined).find(Boolean):undefined;
    const owner=context??sessionOwner;
    if(owner?.model&&owner.model!==selectedModel)throw new CloudError("VALIDATION_ERROR","Conversation model changed. Start a new conversation.",{httpStatus:409});
    if(owner&&(owner.responsesProfile??"deepseek")!==profile)throw new CloudError("VALIDATION_ERROR","Conversation protocol profile changed. Start a new conversation.",{httpStatus:409});
    const normalizeStarted=performance.now();
    const normalized = normalizeDesktopRequest(raw, capabilities?.nativeResponses === true, owner,profile);
    const parsed = ResponseRequestSchema.parse(normalized.request);
    const normalizeMs=Math.round(performance.now()-normalizeStarted);
    const selectedMode = await this.gatewayOptions?.getReasoning?.();
    if(owner?.reasoningMode&&selectedMode&&owner.reasoningMode!==selectedMode)throw new CloudError("VALIDATION_ERROR","Conversation reasoning mode changed. Start a new conversation.",{httpStatus:409});
    const priorInput=structuredClone(owner?.input??[]);
    const historyStarted=performance.now();
    const hasToolOutputs = Array.isArray(parsed.input) && parsed.input.some(item => ["function_call_output", "custom_tool_call_output"].includes(String(item.type)));
    const conversation = sessionOwner && !hasToolOutputs && !parsed.previous_response_id ? sessionOwner : this.resolveConversation(parsed);
    if (sessionOwner && conversation === sessionOwner && !hasToolOutputs && !parsed.previous_response_id) conversation.input = typeof parsed.input==="string" ? [...priorInput,...normalizeInput(parsed.input)] : normalizeInput(parsed.input);
    if (sessionKey) { conversation.sessionKey = sessionKey; this.sessions.set(sessionKey, conversation); if (this.sessions.size > 512) this.sessions.delete(this.sessions.keys().next().value!); }
    if (conversation.model && conversation.model !== selectedModel) throw new CloudError("VALIDATION_ERROR", "Conversation model changed. Start a new conversation.", { httpStatus: 409 });
    if(conversation.responsesProfile&&conversation.responsesProfile!==profile)throw new CloudError("VALIDATION_ERROR","Conversation protocol profile changed. Start a new conversation.",{httpStatus:409});
    if (conversation.reasoningMode && selectedMode && conversation.reasoningMode !== selectedMode) throw new CloudError("VALIDATION_ERROR", "Conversation reasoning mode changed. Start a new conversation.", { httpStatus: 409 });
    conversation.model = selectedModel;
    conversation.reasoningMode = selectedMode ?? String(parsed.reasoning?.mode ?? "auto");
    conversation.responsesProfile=profile;
    conversation.traceId = traceId;
    this.persistConversations();
    if (normalized.customTools.size) conversation.customTools = new Set([...(conversation.customTools ?? []), ...normalized.customTools]);
    if (normalized.toolBindings.size) conversation.toolBindings = new Map([...(conversation.toolBindings ?? []), ...normalized.toolBindings]);
    if(parsed.tools!==undefined)conversation.tools=parsed.tools;
    // A new user instruction resumes an interrupted runtime. Never invent a tool result:
    // record explicitly that no execution result was received, then let the model retry.
    const incomingInput=normalizeInput(parsed.input);
    const isUserInstruction=(item:InputItem)=>item.role==="user"&&!(Array.isArray(item.content)&&item.content.some(part=>part&&typeof part==="object"&&"text" in part&&typeof part.text==="string"&&part.text.startsWith("Sub-agent message (author and recipient retained):\n")));
    const suppliedUser=incomingInput.filter(isUserInstruction);
    const knownUsers=(owner?.responseHistory?.[String(rawRequest.previous_response_id)]??priorInput).filter(isUserInstruction);
    const newInstruction=typeof parsed.input==="string" || suppliedUser.length>knownUsers.length || suppliedUser.some(item=>!knownUsers.some(known=>JSON.stringify(known)===JSON.stringify(item)));
    if(newInstruction) {
      const interrupted=[...this.calls].filter(([,callOwner])=>callOwner===conversation);
      for(const [callId] of interrupted) {
        if(!conversation.input.some(item=>item.call_id===callId&&["function_call","custom_tool_call"].includes(String(item.type)))) {
          const previousCall=priorInput.find(item=>item.call_id===callId&&["function_call","custom_tool_call"].includes(String(item.type)));
          if(previousCall)conversation.input.unshift(previousCall);
        }
        if(conversation.input.some(item=>item.call_id===callId&&["function_call","custom_tool_call"].includes(String(item.type)))) {
          const call=conversation.input.find(item=>item.call_id===callId&&["function_call","custom_tool_call"].includes(String(item.type)))!;
          const index=conversation.input.indexOf(call);
          conversation.input.splice(index+1,0,InputItemSchema.parse({type:call.type==="custom_tool_call"?"custom_tool_call_output":"function_call_output",call_id:callId,output:"Bridge: execution result was not received; this tool call was interrupted before the new user instruction. Do not assume execution succeeded. Retry if necessary."}));
        }
        this.calls.delete(callId);
      }
      if(interrupted.length)this.gatewayOptions?.trace?.write("tool_recovery",traceId,{pendingCount:interrupted.length,status:"interrupted",reason:"new_user_instruction"});
      this.persistConversations();
    }
    const request: ResponseRequest = {
      ...parsed,
      model: selectedModel,
      reasoning: selectedMode ? { ...Object.fromEntries(Object.entries(parsed.reasoning ?? {}).filter(([key]) => key !== "effort")), mode: selectedMode } : parsed.reasoning,
      previous_response_id: undefined,
      input: profile==="deepseek"?conversation.input.map(item => item.type === "custom_tool_call_output" && conversation.input.some(call => call.type === "function_call" && call.call_id === item.call_id) ? { ...item, type: "function_call_output" as const } : item):conversation.input,
      tools: parsed.tools ?? conversation.tools,
    };
    feedback?.capture.request("forwarded",request);
    const forwardedBytes=Buffer.byteLength(JSON.stringify(request));
    feedback?.capture.stats("forwarded",requestStats(request,forwardedBytes));
    feedback?.capture.association({threadId:conversation.threadId});
    const pending=[...this.calls.values()].some(owner=>owner===conversation);
    this.gatewayOptions?.trace?.write("request_normalized",traceId,{responsesProfile:profile,bodyBytes,inputItemCount:Array.isArray(request.input)?request.input.length:1,toolCount:request.tools?.length??0,transformations:Object.fromEntries(normalized.transformations.map(name=>[name,true])),modifiedFields:modifiedRequestFields(raw,request),requestShapeBefore:requestShape(raw),requestShapeAfter:requestShape(request),cloudForwarded:!pending,timings:{parseMs,modelLookupMs,normalizeMs,historyMs:Math.round(performance.now()-historyStarted)},...contentShape(request.input)});
    if(pending) {
      this.persistConversations();
      this.gatewayOptions?.trace?.write("tool_wait",traceId,{pendingCount:[...this.calls.values()].filter(owner=>owner===conversation).length,status:"pending",reason:"missing_tool_outputs"});
      throw new CloudError("TOOL_RESULTS_PENDING","仍有工具调用未返回结果。请等待工具完成，或发送新的指令继续恢复任务。",{httpStatus:409});
    }
    const abort = new AbortController();
    incoming.once("aborted", () => {if(feedback)feedback.userAborted=true;abort.abort();});
    outgoing.once("close", () => {
      if (!outgoing.writableEnded) {if(feedback)feedback.userAborted=true;abort.abort();}
    });
    this.gatewayOptions?.trace?.write("cloud_request",traceId,{threadId:conversation.threadId,logicalModelId:request.model,responsesProfile:profile,bodyBytes:forwardedBytes,reasoningMode:request.reasoning?.mode,stream:request.stream,toolCount:request.tools?.length ?? 0,pendingCalls:[...this.calls].filter(([,owner])=>owner===conversation).map(([id])=>id)},request);
    const cloudStarted=performance.now();
    if(feedback)feedback.stage="cloud_transport";
    const transport = await this.client.createResponse(request, {
      threadId: conversation.threadId,
      traceId,
      signal: abort.signal,
      providerConnectionId: await this.getProviderConnectionId?.(),
    });
    feedback?.capture.association({requestId:transport.response.headers.get("X-Bridge-AI-Request-Id")??transport.response.headers.get("X-Request-Id")});
    if(!transport.response.ok){const errorBody=await transport.response.json().catch(()=>({}));feedback?.capture.http(errorBody);throw new CloudError("CLOUD_HTTP_ERROR","Cloud request failed.",{httpStatus:transport.response.status,requestId:transport.response.headers.get("X-Bridge-AI-Request-Id")??undefined});}
    this.gatewayOptions?.trace?.write("cloud_headers",traceId,{cloudHeadersMs:Math.round(performance.now()-cloudStarted),status:transport.response.status,requestId:transport.response.headers.get("X-Request-Id"),aiRequestId:transport.response.headers.get("X-Bridge-AI-Request-Id"),instanceId:transport.response.headers.get("X-Bridge-Instance-Id"),protocolMode:transport.response.headers.get("X-Bridge-Protocol-Mode"),providerKind:transport.response.headers.get("X-Bridge-Provider-Kind")});
    if (transport.contentType.includes("text/event-stream")) {
      if(feedback)feedback.stage="stream_disconnected";
      await this.relayStream(transport.response, outgoing, conversation,feedback);
      return;
    }
    const payload: unknown = await transport.response.json();
    feedback?.capture.http(payload);
    this.gatewayOptions?.trace?.write("cloud_response",traceId,{},payload);
    const validated = ResponseSchema.safeParse(payload);
    if (!validated.success) throw new CloudError("INVALID_SERVER_RESPONSE", "Cloud returned malformed response.", { httpStatus: 502 });
    const result = validated.data;
    feedback?.capture.association({responseId:result.id,requestId:result.usage.request_id});
    if(result.status==="failed"||result.status==="incomplete")this.reportFailure(feedback,result.status==="failed"?"stream_failed":"stream_incomplete",{code:result.status==="failed"?"RESPONSE_FAILED":"RESPONSE_INCOMPLETE",message:"Cloud response did not complete."});
    const translatedOutput=result.output.map(item => desktopOutputItem(item, conversation.customTools ?? new Set(), conversation.toolBindings));
    this.captureOutput(result.output, conversation);
    this.rememberResponse(result.id, conversation);
    sendJson(outgoing, 200, { ...result, output: translatedOutput });
    this.notifyResponseSettlement({
      responseId: result.id,
      requestId:
        result.usage.request_id
        ?? transport.response.headers.get("X-Bridge-AI-Request-Id"),
      recovery: false,
    });
  }

  private resolveConversation(
    request: ResponseRequest,
  ): RemoteConversation {
    const previous = request.previous_response_id ? this.responses.get(request.previous_response_id) : undefined;
    if (request.previous_response_id && !previous) throw new CloudError("VALIDATION_ERROR", "Previous response is unavailable for this account. Supply complete history.", { httpStatus: 422 });
    if (previous) {
      const extra = normalizeInput(request.input).flatMap(item => {
        if ("type" in item && item.type === "item_reference") {
          const found = previous.input.find(candidate => "id" in candidate && candidate.id === item.id);
          if (!found) throw new CloudError("VALIDATION_ERROR", "Unknown item reference.", { httpStatus: 422 });
          return [found];
        }
        return [item];
      });
      request = { ...request, input: [...(previous.responseHistory?.[request.previous_response_id!] ?? previous.input), ...extra] };
    }
    const outputs = Array.isArray(request.input)
      ? request.input.filter(
          (item): item is Extract<InputItem, { type: "function_call_output" }> =>
            "type" in item && ["function_call_output", "custom_tool_call_output"].includes(String(item.type)),
        )
      : [];
    if (outputs.length === 0) {
      if (previous) { previous.input = normalizeInput(request.input); return previous; }
      return {
        threadId: randomUUID(),
        input: normalizeInput(request.input),
        tools: request.tools ?? [],
      };
    }
    if (new Set(outputs.map(output => output.call_id)).size !== outputs.length) {
      throw new CloudError("VALIDATION_ERROR", "Duplicate function call output IDs.", { httpStatus: 400 });
    }
    const active = outputs.filter(output => this.calls.has(output.call_id));
    const owners = new Set(active.map(output => this.calls.get(output.call_id)!));
    if (owners.size > 1) throw new CloudError("VALIDATION_ERROR", "Tool outputs span active conversations.", { httpStatus: 400 });
    const input = normalizeInput(request.input);
    const fullHistory = input.some(item => "type" in item && ["function_call", "custom_tool_call"].includes(String(item.type)))
      && input.some(item => "role" in item);
    const previousOwner = [...outputs].reverse().map(output => this.historyCalls.get(output.call_id)).find(Boolean);
    const conversation = [...owners][0] ?? previousOwner;
    if (fullHistory) {
      for (const output of outputs) {
        const outputIndex = input.findIndex(item => "type" in item && ["function_call_output", "custom_tool_call_output"].includes(String(item.type)) && item.call_id === output.call_id);
        const callIndex = input.findIndex(item => "type" in item && ["function_call", "custom_tool_call"].includes(String(item.type)) && item.call_id === output.call_id);
        if (callIndex < 0 || callIndex >= outputIndex) throw new CloudError("VALIDATION_ERROR", "Tool output has no preceding call in supplied history.", { httpStatus: 400 });
        const existing = conversation?.input.find(item => "type" in item && ["function_call_output", "custom_tool_call_output"].includes(String(item.type)) && item.call_id === output.call_id);
        if (existing && "output" in existing && JSON.stringify(existing.output) !== JSON.stringify(output.output)) throw new CloudError("VALIDATION_ERROR", "Previous tool output changed.", { httpStatus: 400 });
      }
      const restored = conversation ?? { threadId: randomUUID(), input: [], tools: request.tools ?? [] };
      for (const item of input) {
        if (!("type" in item) || !["function_call", "custom_tool_call"].includes(String(item.type))) continue;
        const owner = this.calls.get(String(item.call_id));
        if (owner && owner !== restored) throw new CloudError("VALIDATION_ERROR", "History contains another active conversation's call.", { httpStatus: 400 });
      }
      restored.input = input;
      restored.tools = request.tools ?? restored.tools;
      for (const item of input) {
        if (!("type" in item) || !["function_call", "custom_tool_call"].includes(String(item.type))) continue;
        this.historyCalls.set(String(item.call_id), restored);
        if (outputs.some(output => output.call_id === item.call_id)) this.calls.delete(String(item.call_id));
        else this.calls.set(String(item.call_id), restored);
      }
      return restored;
    }
    if (!conversation) throw new CloudError("VALIDATION_ERROR", "Tool history is unavailable. Retry with the complete conversation history.", { httpStatus: 400 });
    for (const output of outputs) {
      if (this.calls.get(output.call_id) === conversation) continue;
      const previous = conversation.input.find(item => "type" in item && ["function_call_output", "custom_tool_call_output"].includes(String(item.type)) && item.call_id === output.call_id);
      if (!previous || !("output" in previous) || JSON.stringify(previous.output) !== JSON.stringify(output.output)) throw new CloudError("VALIDATION_ERROR", "Previous function call output does not match this Cloud conversation.", { httpStatus: 400 });
    }
    for (const output of active) {
      this.calls.delete(output.call_id);
      if (!conversation.input.some(item => "type" in item && ["function_call_output", "custom_tool_call_output"].includes(String(item.type)) && item.call_id === output.call_id)) conversation.input.push(InputItemSchema.parse(output));
    }
    // Incremental collaboration messages belong to this continuation too.
    for(const item of input.filter(item=>item.role!==undefined)) {
      if(!conversation.input.some(existing=>JSON.stringify(existing)===JSON.stringify(item)))conversation.input.push(item);
    }
    return conversation;
  }

  private async relayStream(
    cloudResponse: Response,
    desktopResponse: ServerResponse,
    conversation: RemoteConversation,
    feedback?:FailureContext,
  ): Promise<void> {
    if (!cloudResponse.body) {
      throw new CloudError(
        "INVALID_SERVER_RESPONSE",
        "Cloud SSE response has no body.",
      );
    }
    desktopResponse.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const reader = cloudResponse.body.getReader();
    const decoder = new TextDecoder();
    const lifecycle: StreamLifecycle = {
      responseId: null,
      requestId: cloudResponse.headers.get("X-Bridge-AI-Request-Id"),
      completed: false,
      translate: createDesktopEventTranslator(conversation.customTools ?? new Set(), conversation.toolBindings),
      started:performance.now(),receivedBytes:0,eventCount:0,firstEvent:false,firstText:false,
      feedback,
    };
    let eventBuffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lifecycle.receivedBytes+=value.byteLength;
        eventBuffer += decoder.decode(value, { stream: true });
        eventBuffer = this.captureSseEvents(
          eventBuffer,
          conversation,
          lifecycle,
          desktopResponse,
        );
        if (desktopResponse.writableNeedDrain && !desktopResponse.destroyed) await new Promise<void>(resolve => { const finish = () => { desktopResponse.off("drain", finish); desktopResponse.off("close", finish); resolve(); }; desktopResponse.once("drain", finish); desktopResponse.once("close", finish); });
        if (desktopResponse.destroyed) break;
      }
      eventBuffer += decoder.decode();
      this.captureSseEvents(`${eventBuffer}\n\n`, conversation, lifecycle, desktopResponse);
      desktopResponse.end();
    } catch(error) {
      this.reportFailure(feedback,"stream_failed",error);
      throw error;
    } finally {
      if(!lifecycle.completed)this.reportFailure(feedback,"stream_disconnected",{code:"STREAM_DISCONNECTED",message:"Cloud stream ended before a terminal response.",requestId:lifecycle.requestId});
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      this.gatewayOptions?.trace?.write("stream_finished",conversation.traceId??conversation.threadId,{streamMs:Math.round(performance.now()-lifecycle.started),receivedBytes:lifecycle.receivedBytes,eventCount:lifecycle.eventCount,terminalDetected:lifecycle.completed});
      if (!lifecycle.completed && (lifecycle.responseId || lifecycle.requestId)) {
        this.notifyResponseSettlement({
          responseId: lifecycle.responseId,
          requestId: lifecycle.requestId,
          recovery: true,
        });
      }
    }
  }

  private captureSseEvents(
    buffer: string,
    conversation: RemoteConversation,
    lifecycle: StreamLifecycle,
    desktopResponse?: ServerResponse,
  ): string {
    const blocks = buffer.split(/\r?\n\r?\n/);
    const remainder = blocks.pop() ?? "";
    for (const block of blocks) {
      const namedEvent = /^event:\s*(.+)$/m.exec(block)?.[1];
      const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (!data) continue;
      if (data === "[DONE]") { desktopResponse?.write("data: [DONE]\n\n"); continue; }
      let payload:unknown;
      try{payload=JSON.parse(data);}catch(error){lifecycle.feedback?.capture.event({type:"invalid_json_frame",data});throw error;}
      lifecycle.feedback?.capture.event(payload);
      const event = namedEvent ?? (payload && typeof payload === "object" && "type" in payload ? String(payload.type) : undefined);
      lifecycle.eventCount++;
      if(!lifecycle.firstEvent){lifecycle.firstEvent=true;this.gatewayOptions?.trace?.write("stream_first_event",conversation.traceId??conversation.threadId,{event,elapsedMs:Math.round(performance.now()-lifecycle.started)});}
      if(!lifecycle.firstText&&event==="response.output_text.delta"){lifecycle.firstText=true;this.gatewayOptions?.trace?.write("stream_first_text",conversation.traceId??conversation.threadId,{elapsedMs:Math.round(performance.now()-lifecycle.started)});}
      this.gatewayOptions?.trace?.write("cloud_event",conversation.traceId??conversation.threadId,{event,outputIndex:payload && typeof payload === "object" && "output_index" in payload ? payload.output_index : undefined,itemId:payload && typeof payload === "object" && "item_id" in payload ? payload.item_id : undefined},payload);
      if(payload&&typeof payload==="object"&&"item" in payload&&payload.item&&typeof payload.item==="object"&&"type" in payload.item&&payload.item.type==="function_call")this.matchTool(payload.item as Record<string,unknown>,conversation);
      for(const translated of lifecycle.translate(payload)){
        const translatedType=translated&&typeof translated==="object"&&"type" in translated?String(translated.type):namedEvent;
        const prefix=block.split(/\r?\n/).filter(line=>!line.startsWith("data:")&&!line.startsWith("event:")).join("\n");
        desktopResponse?.write(`${prefix}${translatedType?`\nevent: ${translatedType}`:""}\ndata: ${JSON.stringify(translated)}\n\n`);
      }
      if (event === "response.created") {
        lifecycle.responseId = responseIdFromEvent(payload)
          ?? lifecycle.responseId;
        lifecycle.feedback?.capture.association({responseId:lifecycle.responseId});
        continue;
      }
      if (event === "response.completed" || event === "response.incomplete" || event === "response.failed") {
        lifecycle.feedback?.capture.association({responseId:responseIdFromEvent(payload),requestId:lifecycle.requestId});
        if(event!=="response.completed")this.reportFailure(lifecycle.feedback,event==="response.failed"?"stream_failed":"stream_incomplete",{code:event==="response.failed"?"RESPONSE_FAILED":"RESPONSE_INCOMPLETE",message:"Cloud response did not complete."});
        const result = responseFromEvent(payload);
        if (!result) continue;
        if(result.status==="failed"||result.status==="incomplete")this.reportFailure(lifecycle.feedback,result.status==="failed"?"stream_failed":"stream_incomplete",{code:result.status==="failed"?"RESPONSE_FAILED":"RESPONSE_INCOMPLETE",message:"Cloud response did not complete."});
        lifecycle.responseId = result.id;
        lifecycle.requestId =
          result.usage.request_id
          ?? lifecycle.requestId;
        lifecycle.completed = true;
        this.captureOutput(result.output, conversation);
        this.rememberResponse(result.id, conversation);
        this.notifyResponseSettlement({
          responseId: lifecycle.responseId,
          requestId: lifecycle.requestId,
          recovery: false,
        });
        continue;
      }
      if(event==="error")this.reportFailure(lifecycle.feedback,"stream_failed",payload);
      if (event !== "response.output_item.done") continue;
      if (
        !payload
        || typeof payload !== "object"
        || !("item" in payload)
      ) continue;
      const item = OutputItemSchema.parse(payload.item);
      this.captureOutput([item], conversation);
    }
    return remainder;
  }

  private reportFailure(context:FailureContext|undefined,stage:FailureFeedback["stage"],error:unknown):void {
    if(!context||context.userAborted)return;
    try{const report=context.capture.failure(stage,error);if(report)this.gatewayOptions?.failureFeedback?.submit(report);}catch{/* Reporting must never change the model response. */}
  }

  private notifyResponseSettlement(
    target: CloudResponseSettlementTarget,
  ): void {
    if (!this.onResponseSettlement) return;
    void Promise.resolve(this.onResponseSettlement(target)).catch((error) => {
      this.onCloudError?.(error);
    });
  }

  private rememberResponse(id: string, conversation: RemoteConversation) {
    this.responses.set(id, conversation);
    conversation.responseIds = [...new Set([...(conversation.responseIds ?? []), id])].slice(-32);
    conversation.responseHistory = Object.fromEntries(conversation.responseIds.map(responseId => [responseId, responseId === id ? structuredClone(conversation.input) : conversation.responseHistory?.[responseId] ?? []]));
    this.persistConversations();
    if (this.responses.size > 512) this.responses.delete(this.responses.keys().next().value!);
  }
  private persistConversations(){
    this.gatewayOptions?.cache?.save([...new Set([...this.sessions.values(),...this.responses.values(),...this.historyCalls.values(),...this.calls.values()])],this.cacheAccountId);
  }
  private captureOutput(
    output: OutputItem[],
    conversation: RemoteConversation,
  ): void {
    output=output.map(item=>{
      const match=item.type==="function_call"?this.matchTool(item,conversation):undefined;
      return match?OutputItemSchema.parse({...item,name:match[0]}):item;
    });
    for (const item of output) {
      if (!["function_call", "custom_tool_call"].includes(String(item.type))) {
        const existingIndex = typeof item.id === "string" ? conversation.input.findIndex(existing => existing.id === item.id) : -1;
        if (existingIndex >= 0) conversation.input[existingIndex] = InputItemSchema.parse(item);
        else if (!conversation.input.some(existing => JSON.stringify(existing) === JSON.stringify(item))) conversation.input.push(InputItemSchema.parse(item));
        continue;
      }
      const owner = this.calls.get(String(item.call_id));
      if (owner && owner !== conversation) {
        throw new CloudError(
          "INVALID_SERVER_RESPONSE",
          "Cloud function call ID belongs to another active conversation.",
          { httpStatus: 502 },
        );
      }
    }
    for (const item of output) {
      if (!["function_call", "custom_tool_call"].includes(String(item.type))) continue;
      if (!conversation.input.some(
        (existing) => "type" in existing
          && ["function_call", "custom_tool_call"].includes(String(existing.type))
          && existing.call_id === item.call_id,
      )) {
        conversation.input.push(InputItemSchema.parse(item));
      }
      this.calls.set(String(item.call_id), conversation);
      this.historyCalls.set(String(item.call_id), conversation);
      if (this.historyCalls.size > 2000) {const oldest=this.historyCalls.keys().next().value;if(oldest&&!this.calls.has(oldest))this.historyCalls.delete(oldest);}
    }
    this.persistConversations();
  }
  private matchTool(item:Record<string,unknown>,conversation:RemoteConversation) {
    try {
      const match=resolveDesktopTool(String(item.name),conversation.toolBindings);
      this.gatewayOptions?.trace?.write("tool_binding",conversation.traceId??conversation.threadId,{name:item.name,type:item.type,matched:!!match,status:match?"matched":"native",custom:match?.[1].custom??false});
      return match;
    } catch(error) {
      this.gatewayOptions?.trace?.write("tool_binding",conversation.traceId??conversation.threadId,{name:item.name,type:item.type,matched:false,status:"rejected",reason:"unknown_or_ambiguous"});
      throw error;
    }
  }
}

function responseIdFromEvent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("response" in payload)) {
    return null;
  }
  const response = payload.response;
  if (!response || typeof response !== "object" || !("id" in response)) {
    return null;
  }
  return typeof response.id === "string" ? response.id : null;
}

function responseFromEvent(
  payload: unknown,
): ReturnType<typeof ResponseSchema.parse> | null {
  if (!payload || typeof payload !== "object" || !("response" in payload)) {
    return null;
  }
  const parsed = ResponseSchema.safeParse(payload.response);
  return parsed.success ? parsed.data : null;
}

const LOCAL_BODY_LIMIT=64*1024*1024;
async function readJson(request: IncomingMessage, onBytes?: (bytes:number)=>void): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  // Keep the HTTP socket writable when rejecting an oversized body.
  for await (const chunk of request.iterator({destroyOnReturn:false})) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    onBytes?.(size);
    if (size > LOCAL_BODY_LIMIT) {
      request.resume();
      throw new CloudError("PAYLOAD_TOO_LARGE", "请求体超过本地 Bridge 的 64MiB 容量，请减少本轮内容或开启新会话。", {
        httpStatus: 413,
      });
    }
    chunks.push(buffer);
  }
  onBytes?.(size);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Counts only: document text, filenames, URLs, tool arguments/results remain private. */
function contentShape(input: unknown): Record<string,number> {
  let imageParts=0,fileParts=0,toolOutputCount=0;
  if(Array.isArray(input))for(const value of input){if(!value||typeof value!=="object")continue;const item=value as Record<string,unknown>;
    if(["function_call_output","custom_tool_call_output"].includes(String(item.type)))toolOutputCount++;
    for(const parts of [item.content,item.output])if(Array.isArray(parts))for(const part of parts){if(!part||typeof part!=="object")continue;if(part.type==="input_image")imageParts++;if(part.type==="input_file")fileParts++;}
  }
  return {imageParts,fileParts,toolOutputCount};
}

function normalizeInput(input: ResponseRequest["input"]): InputItem[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }
  return input.map((item) => InputItemSchema.parse(item));
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  if (response.headersSent || response.writableEnded) return;
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function sendCloudError(response: ServerResponse, error: unknown): void {
  if (response.writableEnded) return;
  if (response.headersSent) {
    const code=error instanceof CloudError?error.code:"INVALID_SERVER_RESPONSE";
    const message=error instanceof CloudError?error.message:"Cloud returned an invalid response stream.";
    response.end(`event: error\ndata: ${JSON.stringify({type:"error",code,message,requestId:error instanceof CloudError?error.requestId??randomUUID():randomUUID()})}\n\n`);
    return;
  }
  if (error instanceof ZodError) { sendJson(response, 400, { error: { code: "INVALID_REQUEST", message: "Malformed Responses request.", requestId: randomUUID() } }); return; }
  if (error instanceof CloudError) {
    sendJson(response, error.httpStatus ?? statusForCode(error.code), {
      error: {
        code: error.code,
        message: error.message,
        requestId: error.requestId ?? randomUUID(),
      },
    });
    return;
  }
  sendJson(response, 500, {
    error: {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Internal error",
      requestId: randomUUID(),
    },
  });
}

function statusForCode(code: string): number {
  if (code === "TOKEN_EXPIRED" || code === "UNAUTHORIZED") return 401;
  if (
    code === "DEVICE_REVOKED"
    || code === "DEVICE_NOT_REGISTERED"
    || code === "SUBSCRIPTION_REQUIRED"
    || code === "SUBSCRIPTION_EXPIRED"
    || code === "MODEL_NOT_ALLOWED"
  ) return 403;
  if (code === "MONTHLY_QUOTA_EXCEEDED" || code === "RATE_LIMITED") {
    return 429;
  }
  if (code === "PROVIDER_UNAVAILABLE" || code === "MODEL_UNAVAILABLE") {
    return 503;
  }
  if (code === "GATEWAY_TIMEOUT") return 504;
  if (code === "VALIDATION_ERROR" || code === "CLIENT_THREAD_ID_REQUIRED") {
    return 400;
  }
  return 500;
}

export function serverPort(server: Server): number | null {
  const address = server.address();
  return address && typeof address !== "string"
    ? address.port
    : null;
}

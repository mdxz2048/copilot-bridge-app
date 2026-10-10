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
  type FunctionTool,
  type InputItem,
  type OutputItem,
  type ResponseRequest,
} from "./contract.js";
import type { CloudClient } from "./cloud-client.js";
import { CloudError } from "./cloud-error.js";
import { normalizeDesktopRequest, desktopEvent, desktopOutputItem, type DesktopToolBinding } from "./desktop-protocol.js";

export interface RemoteConversation {
  traceId?: string;
  toolBindings?: Map<string, DesktopToolBinding>;
  customTools?: Set<string>;
  threadId: string;
  input: InputItem[];
  tools: FunctionTool[];
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
}
interface GatewayOptions {
  cache?: {load(accountId:string):RemoteConversation[];save(items:RemoteConversation[],accountId:string):void};
  trace?: {write(stage:string,traceId:string,metadata:Record<string,unknown>,body?:unknown):void};
  getApiKey: () => Promise<string | null>;
  getModel?: () => Promise<string | null>;
  getReasoning?: () => Promise<string | null>;
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
        const completed=new Set(conversation.input.filter(item=>"type" in item&&item.type==="function_call_output").map(item=>String(item.call_id)));
        for(const item of conversation.input) if("type" in item&&item.type==="function_call") {this.historyCalls.set(String(item.call_id),conversation);if(!completed.has(String(item.call_id)))this.calls.set(String(item.call_id),conversation);}
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
    supportsReasoningEffort: boolean;
  }>> {
    const models = await this.client.listModels();
    return models.data.map((model) => ({
      id: model.id,
      supportsReasoningEffort: model.capabilities.reasoning,
    }));
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const traceId = randomUUID();
    response.setHeader("X-Bridge-Trace-Id", traceId);
    response.once("finish", () => this.gatewayOptions?.trace?.write("desktop_finished",traceId,{status:response.statusCode}));
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
                })),
              }
            : models,
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/responses") {
        await this.handleResponse(request, response, traceId);
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
      this.gatewayOptions?.trace?.write("request_failed",traceId,{code:error instanceof CloudError?error.code:"LOCAL_ERROR",message:error instanceof Error?error.message:"Unknown error"});
      this.onCloudError?.(error);
      sendCloudError(response, error);
    }
  }

  private async handleResponse(
    incoming: IncomingMessage,
    outgoing: ServerResponse,
    traceId: string,
  ): Promise<void> {
    const raw = await readJson(incoming);
    this.gatewayOptions?.trace?.write("desktop_request",traceId,{sessionId:incoming.headers["session_id"],conversationId:incoming.headers["conversation_id"]},raw);
    const normalized = normalizeDesktopRequest(raw);
    const parsed = ResponseRequestSchema.parse(normalized.request);
    const conversation = this.resolveConversation(parsed);
    conversation.traceId = traceId;
    this.persistConversations();
    if (normalized.customTools.size) conversation.customTools = normalized.customTools;
    if (normalized.toolBindings.size) conversation.toolBindings = normalized.toolBindings;
    if ([...this.calls.values()].some((owner) => owner === conversation)) {
      sendPendingToolAcknowledgment(outgoing, parsed);
      return;
    }
    const request: ResponseRequest = {
      ...parsed,
      model: (await this.gatewayOptions?.getModel?.()) ?? parsed.model,
      reasoning: (await this.gatewayOptions?.getReasoning?.())
        ? { effort: await this.gatewayOptions?.getReasoning?.() } : parsed.reasoning,
      input: conversation.input,
      tools: parsed.tools ?? conversation.tools,
    };
    const abort = new AbortController();
    incoming.once("aborted", () => abort.abort());
    outgoing.once("close", () => {
      if (!outgoing.writableEnded) abort.abort();
    });
    this.gatewayOptions?.trace?.write("cloud_request",traceId,{threadId:conversation.threadId,pendingCalls:[...this.calls].filter(([,owner])=>owner===conversation).map(([id])=>id)},request);
    const transport = await this.client.createResponse(request, {
      threadId: conversation.threadId,
      signal: abort.signal,
      providerConnectionId: await this.getProviderConnectionId?.(),
    });
    this.gatewayOptions?.trace?.write("cloud_headers",traceId,{status:transport.response.status,requestId:transport.response.headers.get("X-Request-Id"),aiRequestId:transport.response.headers.get("X-Bridge-AI-Request-Id")});
    if (transport.contentType.includes("text/event-stream")) {
      await this.relayStream(transport.response, outgoing, conversation);
      return;
    }
    const payload: unknown = await transport.response.json();
    this.gatewayOptions?.trace?.write("cloud_response",traceId,{},payload);
    const result = ResponseSchema.parse(payload);
    this.captureOutput(result.output, conversation);
    sendJson(outgoing, 200, { ...result, output: result.output.map(item => desktopOutputItem(item, conversation.customTools ?? new Set(), conversation.toolBindings)) });
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
    const outputs = Array.isArray(request.input)
      ? request.input.filter(
          (item): item is Extract<InputItem, { type: "function_call_output" }> =>
            "type" in item && item.type === "function_call_output",
        )
      : [];
    if (outputs.length === 0) {
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
    const fullHistory = input.some(item => "type" in item && item.type === "function_call")
      && input.some(item => "role" in item);
    const previousOwner = [...outputs].reverse().map(output => this.historyCalls.get(output.call_id)).find(Boolean);
    const conversation = [...owners][0] ?? previousOwner;
    if (fullHistory) {
      for (const output of outputs) {
        const outputIndex = input.findIndex(item => "type" in item && item.type === "function_call_output" && item.call_id === output.call_id);
        const callIndex = input.findIndex(item => "type" in item && item.type === "function_call" && item.call_id === output.call_id);
        if (callIndex < 0 || callIndex >= outputIndex) throw new CloudError("VALIDATION_ERROR", "Tool output has no preceding call in supplied history.", { httpStatus: 400 });
        const existing = conversation?.input.find(item => "type" in item && item.type === "function_call_output" && item.call_id === output.call_id);
        if (existing && "output" in existing && existing.output !== output.output) throw new CloudError("VALIDATION_ERROR", "Previous tool output changed.", { httpStatus: 400 });
      }
      const restored = conversation ?? { threadId: randomUUID(), input: [], tools: request.tools ?? [] };
      for (const item of input) {
        if (!("type" in item) || item.type !== "function_call") continue;
        const owner = this.calls.get(String(item.call_id));
        if (owner && owner !== restored) throw new CloudError("VALIDATION_ERROR", "History contains another active conversation's call.", { httpStatus: 400 });
      }
      restored.input = input;
      restored.tools = request.tools ?? restored.tools;
      for (const item of input) {
        if (!("type" in item) || item.type !== "function_call") continue;
        this.historyCalls.set(String(item.call_id), restored);
        if (outputs.some(output => output.call_id === item.call_id)) this.calls.delete(String(item.call_id));
        else this.calls.set(String(item.call_id), restored);
      }
      return restored;
    }
    if (!conversation) throw new CloudError("VALIDATION_ERROR", "Tool history is unavailable. Retry with the complete conversation history.", { httpStatus: 400 });
    for (const output of outputs) {
      if (this.calls.get(output.call_id) === conversation) continue;
      const previous = conversation.input.find(item => "type" in item && item.type === "function_call_output" && item.call_id === output.call_id);
      if (!previous || !("output" in previous) || previous.output !== output.output) throw new CloudError("VALIDATION_ERROR", "Previous function call output does not match this Cloud conversation.", { httpStatus: 400 });
    }
    for (const output of active) {
      this.calls.delete(output.call_id);
      if (!conversation.input.some(item => "type" in item && item.type === "function_call_output" && item.call_id === output.call_id)) conversation.input.push(InputItemSchema.parse(output));
    }
    return conversation;
  }

  private async relayStream(
    cloudResponse: Response,
    desktopResponse: ServerResponse,
    conversation: RemoteConversation,
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
    };
    let eventBuffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        eventBuffer += decoder.decode(value, { stream: true });
        eventBuffer = this.captureSseEvents(
          eventBuffer,
          conversation,
          lifecycle,
          desktopResponse,
        );
      }
      eventBuffer += decoder.decode();
      this.captureSseEvents(`${eventBuffer}\n\n`, conversation, lifecycle, desktopResponse);
      desktopResponse.end();
    } finally {
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
      const event = /^event:\s*(.+)$/m.exec(block)?.[1];
      const data = /^data:\s*(.+)$/m.exec(block)?.[1];
      if (!data) continue;
      if (data === "[DONE]") { desktopResponse?.write("data: [DONE]\n\n"); continue; }
      const payload: unknown = JSON.parse(data);
      this.gatewayOptions?.trace?.write("cloud_event",conversation.traceId??conversation.threadId,{event},payload);
      desktopResponse?.write(`${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(desktopEvent(payload, conversation.customTools ?? new Set(), conversation.toolBindings))}\n\n`);
      if (event === "response.created") {
        lifecycle.responseId = responseIdFromEvent(payload)
          ?? lifecycle.responseId;
        continue;
      }
      if (event === "response.completed") {
        const result = responseFromEvent(payload);
        if (!result) continue;
        lifecycle.responseId = result.id;
        lifecycle.requestId =
          result.usage.request_id
          ?? lifecycle.requestId;
        lifecycle.completed = true;
        this.captureOutput(result.output, conversation);
        this.notifyResponseSettlement({
          responseId: lifecycle.responseId,
          requestId: lifecycle.requestId,
          recovery: false,
        });
        continue;
      }
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

  private notifyResponseSettlement(
    target: CloudResponseSettlementTarget,
  ): void {
    if (!this.onResponseSettlement) return;
    void Promise.resolve(this.onResponseSettlement(target)).catch((error) => {
      this.onCloudError?.(error);
    });
  }

  private persistConversations(){
    this.gatewayOptions?.cache?.save([...new Set([...this.historyCalls.values(),...this.calls.values()])],this.cacheAccountId);
  }
  private captureOutput(
    output: OutputItem[],
    conversation: RemoteConversation,
  ): void {
    for (const item of output) {
      if (item.type !== "function_call") continue;
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
      if (item.type !== "function_call") continue;
      if (!conversation.input.some(
        (existing) => "type" in existing
          && existing.type === "function_call"
          && existing.call_id === item.call_id,
      )) {
        conversation.input.push(item);
      }
      this.calls.set(item.call_id, conversation);
      this.historyCalls.set(item.call_id, conversation);
      if (this.historyCalls.size > 2000) {const oldest=this.historyCalls.keys().next().value;if(oldest&&!this.calls.has(oldest))this.historyCalls.delete(oldest);}
    }
    this.persistConversations();
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

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 10 * 1024 * 1024) {
      throw new CloudError("VALIDATION_ERROR", "Request body is too large.", {
        httpStatus: 400,
      });
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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

function sendPendingToolAcknowledgment(
  response: ServerResponse,
  request: ResponseRequest,
): void {
  const result = ResponseSchema.parse({
    id: `resp_${randomUUID().replaceAll("-", "")}`,
    object: "response",
    status: "completed",
    model: request.model,
    output: [],
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  });
  if (!request.stream) {
    sendJson(response, 200, result);
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  response.end(
    `event: response.created\ndata: ${JSON.stringify({
      type: "response.created",
      response: { ...result, status: "in_progress" },
    })}\n\n`
    + `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: result })}\n\n`
    + "data: [DONE]\n\n",
  );
}

function sendCloudError(response: ServerResponse, error: unknown): void {
  if (response.headersSent || response.writableEnded) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }
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

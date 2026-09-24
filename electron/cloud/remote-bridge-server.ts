import { randomUUID } from "node:crypto";
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

interface RemoteConversation {
  threadId: string;
  input: InputItem[];
  tools: FunctionTool[];
}

export interface RemoteBridgeStatus {
  state: "stopped" | "starting" | "ready" | "failed";
  message: string;
  endpoint: string;
}

export class RemoteBridgeServer {
  private readonly client: CloudClient;
  private readonly onCloudError?: (error: unknown) => void;
  private readonly getProviderConnectionId?: () => Promise<string | null>;
  private readonly port: number;
  private readonly calls = new Map<string, RemoteConversation>();
  private server: Server | null = null;
  private status: RemoteBridgeStatus;

  constructor(
    client: CloudClient,
    port = 8787,
    onCloudError?: (error: unknown) => void,
    getProviderConnectionId?: () => Promise<string | null>,
  ) {
    this.client = client;
    this.port = port;
    this.onCloudError = onCloudError;
    this.getProviderConnectionId = getProviderConnectionId;
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
      await this.client.getMe();
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
    const server = this.server;
    this.server = null;
    this.calls.clear();
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
    try {
      const url = new URL(request.url ?? "/", this.status.endpoint);
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
        await this.handleResponse(request, response);
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
      this.onCloudError?.(error);
      sendCloudError(response, error);
    }
  }

  private async handleResponse(
    incoming: IncomingMessage,
    outgoing: ServerResponse,
  ): Promise<void> {
    const parsed = ResponseRequestSchema.parse(await readJson(incoming));
    const conversation = this.resolveConversation(parsed);
    const request: ResponseRequest = {
      ...parsed,
      input: conversation.input,
      tools: parsed.tools ?? conversation.tools,
    };
    const abort = new AbortController();
    incoming.once("aborted", () => abort.abort());
    outgoing.once("close", () => {
      if (!outgoing.writableEnded) abort.abort();
    });
    const transport = await this.client.createResponse(request, {
      threadId: conversation.threadId,
      signal: abort.signal,
      providerConnectionId: await this.getProviderConnectionId?.(),
    });
    if (transport.contentType.includes("text/event-stream")) {
      await this.relayStream(transport.response, outgoing, conversation);
      return;
    }
    const payload: unknown = await transport.response.json();
    const result = ResponseSchema.parse(payload);
    this.captureOutput(result.output, conversation);
    sendJson(outgoing, 200, result);
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
    const conversations = new Set(
      outputs.map((output) => this.calls.get(output.call_id)),
    );
    if (conversations.has(undefined) || conversations.size !== 1) {
      throw new CloudError(
        "VALIDATION_ERROR",
        "Function call outputs do not belong to one active Cloud conversation.",
        { httpStatus: 400 },
      );
    }
    const conversation = [...conversations][0];
    if (!conversation) {
      throw new CloudError(
        "VALIDATION_ERROR",
        "Cloud conversation is unavailable.",
        { httpStatus: 400 },
      );
    }
    for (const output of outputs) {
      this.calls.delete(output.call_id);
      conversation.input.push(InputItemSchema.parse(output));
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
    let eventBuffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      desktopResponse.write(value);
      eventBuffer += decoder.decode(value, { stream: true });
      eventBuffer = this.captureSseEvents(eventBuffer, conversation);
    }
    eventBuffer += decoder.decode();
    this.captureSseEvents(`${eventBuffer}\n\n`, conversation);
    desktopResponse.end();
  }

  private captureSseEvents(
    buffer: string,
    conversation: RemoteConversation,
  ): string {
    const blocks = buffer.split(/\r?\n\r?\n/);
    const remainder = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = /^event:\s*(.+)$/m.exec(block)?.[1];
      const data = /^data:\s*(.+)$/m.exec(block)?.[1];
      if (event !== "response.output_item.done" || !data) continue;
      const payload: unknown = JSON.parse(data);
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

  private captureOutput(
    output: OutputItem[],
    conversation: RemoteConversation,
  ): void {
    for (const item of output) {
      if (item.type !== "function_call") continue;
      conversation.input.push(item);
      this.calls.set(item.call_id, conversation);
    }
  }
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

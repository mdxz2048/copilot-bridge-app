import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { CopilotSession, MessageOptions, SessionEvent, Tool } from "@github/copilot-sdk";
import type { Conversation } from "#conversation-manager.js";
import type { Logger } from "#logger.js";
import type { Stats } from "#stats.js";
import {
  ResponsesProtocol,
  startResponseStream,
} from "#providers/codex/streaming.js";
import type { CommonEventHandler } from "#providers/shared/streaming-core.js";
import { createCommonEventHandler } from "#providers/shared/streaming-core.js";

type ExternalToolRequest = Extract<
  SessionEvent,
  { type: "external_tool.requested" }
>["data"];

export interface FunctionCallOutput {
  call_id: string;
  output: string;
}

interface PendingToolCall {
  requestId: string;
}

const DEFAULT_TOOL_TIMEOUT_MS = 5 * 60_000;
const TOOL_CALL_BATCH_DELAY_MS = 25;

export class CodexToolBridgeRegistry {
  private readonly byConversation = new WeakMap<
    Conversation,
    CodexToolBridge
  >();
  private readonly byCallId = new Map<string, CodexToolBridge>();
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor(logger: Logger, timeoutMs: number) {
    this.logger = logger;
    this.timeoutMs = timeoutMs > 0 ? timeoutMs : DEFAULT_TOOL_TIMEOUT_MS;
  }

  prepare(
    conversation: Conversation,
    tools: Tool<Record<string, unknown>>[],
  ): CodexToolBridge {
    const existing = this.byConversation.get(conversation);
    if (existing) return existing;

    const bridge = new CodexToolBridge(
      tools,
      this.logger,
      this.timeoutMs,
      (callId) => this.byCallId.set(callId, bridge),
      (callId) => this.byCallId.delete(callId),
    );
    this.byConversation.set(conversation, bridge);
    return bridge;
  }

  get(conversation: Conversation): CodexToolBridge | undefined {
    return this.byConversation.get(conversation);
  }

  findForOutputs(outputs: readonly FunctionCallOutput[]): {
    bridge: CodexToolBridge | undefined;
    hasConflictingCalls: boolean;
  } {
    const bridges = new Set<CodexToolBridge>();
    for (const output of outputs) {
      const bridge = this.byCallId.get(output.call_id);
      if (bridge) bridges.add(bridge);
    }
    if (bridges.size !== 1) {
      return { bridge: undefined, hasConflictingCalls: bridges.size > 1 };
    }
    return { bridge: [...bridges][0], hasConflictingCalls: false };
  }
}

export class CodexToolBridge {
  readonly tools: Tool<Record<string, unknown>>[];
  private readonly registerCall: (callId: string) => void;
  private readonly forgetCall: (callId: string) => void;
  private readonly logger: Logger;
  private readonly timeoutMs: number;
  private readonly pending = new Map<string, PendingToolCall>();
  private queued: ExternalToolRequest[] = [];
  private reply: FastifyReply | null = null;
  private protocol: ResponsesProtocol | null = null;
  private common: CommonEventHandler | null = null;
  private unsubscribe = (): void => {};
  private publishTimer: ReturnType<typeof setTimeout> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private resolveDone: ((healthy: boolean) => void) | null = null;
  private done: Promise<boolean> | null = null;
  private session: CopilotSession | null = null;
  private settled = false;

  constructor(
    tools: Tool<Record<string, unknown>>[],
    logger: Logger,
    timeoutMs: number,
    registerCall: (callId: string) => void,
    forgetCall: (callId: string) => void,
  ) {
    this.tools = tools;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.registerCall = registerCall;
    this.forgetCall = forgetCall;
  }

  get hasPendingCalls(): boolean {
    return this.pending.size > 0;
  }

  async start(
    session: CopilotSession,
    message: string | MessageOptions,
    model: string,
    reply: FastifyReply,
    stats: Stats,
  ): Promise<boolean> {
    if (this.done && !this.settled) {
      throw new Error("Codex tool bridge session is already active");
    }

    this.settled = false;
    this.done = new Promise<boolean>((resolve) => {
      this.resolveDone = resolve;
    });
    this.session = session;
    this.openResponse(reply, model, stats);
    this.unsubscribe = session.on((event) => this.handleEvent(session, event));

    const sendPromise = typeof message === "string"
      ? session.send(message)
      : session.send(message);
    sendPromise.catch((err: unknown) => {
      this.fail(
        session,
        err instanceof Error ? err.message : "Failed to send prompt",
      );
    });

    return this.done;
  }

  async continueWith(
    outputs: readonly FunctionCallOutput[],
    model: string,
    reply: FastifyReply,
    stats: Stats,
  ): Promise<boolean> {
    const session = this.session;
    if (!session || !this.done || this.settled || this.pending.size === 0) {
      throw new Error("No pending function calls for this response");
    }

    const supplied = new Set(
      outputs
        .filter((output) => this.pending.has(output.call_id))
        .map((output) => output.call_id),
    );
    for (const callId of this.pending.keys()) {
      if (!supplied.has(callId)) {
        throw new Error(`Missing function_call_output for call_id ${callId}`);
      }
    }

    this.clearTimeout();
    this.openResponse(reply, model, stats);
    try {
      await Promise.all(
        outputs.map(async (output) => {
          const pending = this.pending.get(output.call_id);
          if (!pending) return;
          const result = await session.rpc.tools.handlePendingToolCall({
            requestId: pending.requestId,
            result: output.output,
          });
          if (!result.success) {
            throw new Error(
              `The runtime rejected function_call_output for ${output.call_id}`,
            );
          }
          this.pending.delete(output.call_id);
          this.forgetCall(output.call_id);
        }),
      );
    } catch (err) {
      this.fail(
        session,
        err instanceof Error ? err.message : "Failed to resume tool call",
      );
    }

    return this.done;
  }

  private openResponse(reply: FastifyReply, model: string, stats: Stats): void {
    const responseId = `resp_${randomUUID()}`;
    const { seq, createdAt } = startResponseStream(reply, responseId, model);
    this.reply = reply;
    this.protocol = new ResponsesProtocol(responseId, model, seq, createdAt);
    this.common = createCommonEventHandler(
      this.protocol,
      () => this.reply,
      this.logger,
      stats,
    );
    this.attachDisconnect(reply);
  }

  private handleEvent(session: CopilotSession, event: SessionEvent): void {
    if (this.settled) return;
    if (event.type === "external_tool.requested") {
      this.queueToolCall(session, event.data);
      return;
    }
    if (this.common?.handle(event)) return;

    switch (event.type) {
      case "assistant.message":
        this.common?.flushDeltas();
        break;
      case "session.idle":
        this.complete();
        break;
      case "session.error":
        this.fail(session, event.data.message);
        break;
      default:
        break;
    }
  }

  private queueToolCall(
    session: CopilotSession,
    request: ExternalToolRequest,
  ): void {
    if (!this.reply) {
      this.fail(
        session,
        `Received external tool request ${request.toolCallId} without an active response`,
      );
      return;
    }
    if (
      this.pending.has(request.toolCallId) ||
      this.queued.some((call) => call.toolCallId === request.toolCallId)
    ) {
      return;
    }

    this.queued.push(request);
    if (this.publishTimer !== undefined) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = undefined;
      this.publishToolCalls(session);
    // The SDK can deliver calls from one agent turn across adjacent event-loop
    // ticks. Batch briefly so every call is represented in the same SSE response.
    }, TOOL_CALL_BATCH_DELAY_MS);
  }

  private publishToolCalls(session: CopilotSession): void {
    if (this.settled || this.queued.length === 0) return;
    const reply = this.reply;
    const protocol = this.protocol;
    if (!reply || !protocol) {
      this.fail(session, "No response available for external tool call");
      return;
    }

    const calls = this.queued;
    this.queued = [];
    for (const call of calls) {
      this.pending.set(call.toolCallId, {
        requestId: call.requestId,
      });
      this.registerCall(call.toolCallId);
      this.logger.info(
        `External tool requested: ${call.toolName} (id=${call.toolCallId})`,
      );
    }

    this.common?.flushReasoningDeltas();
    this.common?.flushDeltas();
    protocol.sendFunctionCalls(
      reply,
      calls.map((call) => ({
        toolCallId: call.toolCallId,
        name: call.toolName,
        ...(call.arguments && { arguments: call.arguments }),
      })),
    );
    this.reply = null;
    this.protocol = null;
    this.common = null;
    reply.raw.end();
    this.armTimeout(session);
  }

  private complete(): void {
    if (this.settled) return;
    this.settled = true;
    this.clearTimers();
    this.common?.flushReasoningDeltas();
    this.common?.flushDeltas();
    const reply = this.reply;
    const protocol = this.protocol;
    this.reply = null;
    this.protocol = null;
    this.common = null;
    if (reply && protocol) {
      protocol.sendCompleted(reply);
      reply.raw.end();
    }
    this.clearPending();
    this.unsubscribe();
    this.resolveDone?.(true);
  }

  private fail(session: CopilotSession, message: string): void {
    if (this.settled) return;
    this.logger.error(`Codex tool bridge failed: ${message}`);
    this.settled = true;
    this.clearTimers();
    const reply = this.reply;
    const protocol = this.protocol;
    this.reply = null;
    this.protocol = null;
    this.common = null;
    if (reply && protocol) {
      protocol.sendFailed(reply);
      reply.raw.end();
    }
    this.clearPending();
    this.unsubscribe();
    this.resolveDone?.(false);
    session.abort().catch((err: unknown) => {
      this.logger.error("Failed to abort Codex tool bridge session:", err);
    });
  }

  private attachDisconnect(reply: FastifyReply): void {
    reply.raw.on("close", () => {
      if (this.reply === reply && !this.settled && this.session) {
        this.fail(this.session, "Client disconnected");
      }
    });
  }

  private armTimeout(session: CopilotSession): void {
    this.clearTimeout();
    this.timeout = setTimeout(() => {
      this.fail(
        session,
        `Timed out waiting ${String(this.timeoutMs)}ms for function_call_output`,
      );
    }, this.timeoutMs);
  }

  private clearTimeout(): void {
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  private clearTimers(): void {
    this.clearTimeout();
    if (this.publishTimer !== undefined) {
      clearTimeout(this.publishTimer);
      this.publishTimer = undefined;
    }
  }

  private clearPending(): void {
    for (const callId of this.pending.keys()) {
      this.forgetCall(callId);
    }
    this.pending.clear();
    this.queued = [];
  }
}

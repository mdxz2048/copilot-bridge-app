import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { FastifyReply } from "fastify";
import { ToolSet } from "@github/copilot-sdk";
import type {
  CopilotSession,
  SessionConfig,
  SessionEvent,
  Tool,
} from "@github/copilot-sdk";
import type { Conversation } from "#conversation-manager.js";
import type { AppContext } from "#context.js";
import { Logger } from "#logger.js";
import { codexProvider } from "#providers/codex/provider.js";
import { Stats } from "#stats.js";
import { CodexToolBridgeRegistry } from "#providers/codex/tool-bridge.js";
import { createServer } from "#server.js";

interface MockReply {
  reply: FastifyReply;
  chunks: string[];
  close: () => void;
}

interface MockSession {
  session: CopilotSession;
  emit: (event: SessionEvent) => void;
  handleResult: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

function createReply(): MockReply {
  const chunks: string[] = [];
  let closeHandler = (): void => {};
  const raw = {
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => {
      chunks.push(chunk);
    }),
    end: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === "close") closeHandler = handler;
      return raw;
    }),
  };
  return {
    reply: { raw } as unknown as FastifyReply,
    chunks,
    close: () => closeHandler(),
  };
}

function createSession(): MockSession {
  let listener: ((event: SessionEvent) => void) | undefined;
  const handleResult = vi.fn().mockResolvedValue({ success: true });
  const abort = vi.fn().mockResolvedValue(undefined);
  const session = {
    on: vi.fn((callback: (event: SessionEvent) => void) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    }),
    send: vi.fn().mockResolvedValue("message_1"),
    abort,
    rpc: { tools: { handlePendingToolCall: handleResult } },
  } as unknown as CopilotSession;
  return {
    session,
    emit: (event) => listener?.(event),
    handleResult,
    abort,
  };
}

function externalTool(
  toolCallId: string,
  requestId: string,
  toolName = "read_file",
): SessionEvent {
  return {
    type: "external_tool.requested",
    data: {
      requestId,
      sessionId: "session_1",
      toolCallId,
      toolName,
      arguments: { path: "example.txt" },
    },
  } as unknown as SessionEvent;
}

function idle(): SessionEvent {
  return { type: "session.idle", data: {} } as SessionEvent;
}

function textDelta(text: string): SessionEvent {
  return {
    type: "assistant.message_delta",
    data: { deltaContent: text },
  } as SessionEvent;
}

function conversation(id: string): Conversation {
  return {
    id,
    session: null,
    sentMessageCount: 0,
    isPrimary: true,
    model: "gpt-5",
    sessionActive: true,
    hadError: false,
  };
}

function createBridge(timeoutMs = 1000) {
  const registry = new CodexToolBridgeRegistry(new Logger("none"), timeoutMs);
  const tools: Tool<Record<string, unknown>>[] = [
    {
      name: "read_file",
      description: "Read a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
      },
      skipPermission: true,
    },
  ];
  return registry.prepare(conversation("conversation_1"), tools);
}

async function publishToolCalls(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 35));
}

describe("CodexToolBridge", () => {
  it("forwards a Desktop image attachment to the SDK initial message", async () => {
    const directory = await mkdtemp(join(tmpdir(), "copilot-provider-attachment-"));
    try {
      const imagePath = join(directory, "desktop-image.png");
      await writeFile(imagePath, Buffer.from([137, 80, 78, 71]));
      let listener: ((event: SessionEvent) => void) | undefined;
      const send = vi.fn().mockImplementation(async () => {
        queueMicrotask(() => listener?.(idle()));
        return "message_1";
      });
      const session = {
        on: vi.fn((callback: (event: SessionEvent) => void) => {
          listener = callback;
          return () => {
            listener = undefined;
          };
        }),
        send,
        abort: vi.fn().mockResolvedValue(undefined),
      } as unknown as CopilotSession;
      const ctx: AppContext = {
        service: {
          cwd: directory,
          listModels: vi.fn().mockResolvedValue([
            {
              id: "gpt-5",
              capabilities: { supports: { reasoningEffort: false } },
            },
          ]),
          createSession: vi.fn().mockResolvedValue(session),
        } as unknown as AppContext["service"],
        logger: new Logger("none"),
        config: {
          mcpServers: {},
          allowedCliTools: [],
          bodyLimit: 1024 * 1024,
          requestTimeoutMs: 0,
          autoApprovePermissions: true,
        },
        port: 0,
        stats: new Stats(),
      };
      const app = await createServer(ctx, codexProvider);

      try {
        const response = await app.inject({
          method: "POST",
          url: "/v1/responses",
          payload: {
            model: "gpt-5",
            input: [{
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `# Files mentioned by the user:\n\n## desktop-image.png: ${imagePath}`,
                },
                {
                  type: "input_image",
                  image_url: "data:image/png;base64,iVBORw0KGgo=",
                },
              ],
            }],
          },
        });

        expect(response.statusCode).toBe(200);
        expect(send).toHaveBeenCalledWith(expect.objectContaining({
          attachments: [{ type: "file", path: imagePath }],
        }));
      } finally {
        await app.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("maps Responses function declarations to SDK declaration-only tools", async () => {
    let capturedConfig: SessionConfig | undefined;
    const session = {
      on: (callback: (event: SessionEvent) => void) => {
        queueMicrotask(() => callback(idle()));
        return () => {};
      },
      send: vi.fn().mockResolvedValue("message_1"),
      abort: vi.fn().mockResolvedValue(undefined),
    } as unknown as CopilotSession;
    const ctx: AppContext = {
      service: {
        cwd: "E:\\test",
        listModels: vi.fn().mockResolvedValue([
          {
            id: "gpt-5",
            capabilities: { supports: { reasoningEffort: false } },
          },
        ]),
        createSession: vi.fn((config: SessionConfig) => {
          capturedConfig = config;
          return Promise.resolve(session);
        }),
      } as unknown as AppContext["service"],
      logger: new Logger("none"),
      config: {
        mcpServers: {},
        allowedCliTools: [],
        bodyLimit: 1024 * 1024,
        requestTimeoutMs: 0,
        autoApprovePermissions: true,
      },
      port: 0,
      stats: new Stats(),
    };
    const app = await createServer(ctx, codexProvider);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/responses",
        payload: {
          model: "gpt-5",
          input: "Read the file",
          tools: [
            {
              type: "function",
              name: "read_file",
              description: "Read a path",
              parameters: {
                type: "object",
                properties: { path: { type: "string" } },
              },
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      if (!capturedConfig) throw new Error("Expected session configuration");
      expect(capturedConfig.tools).toEqual([
        expect.objectContaining({
          name: "read_file",
          skipPermission: true,
          overridesBuiltInTool: true,
        }),
      ]);
      expect(capturedConfig.availableTools).toBeInstanceOf(ToolSet);
      expect((capturedConfig.availableTools as ToolSet).toArray()).toEqual([
        "custom:read_file",
      ]);
    } finally {
      await app.close();
    }
  });

  it("emits correlated function calls, accepts outputs, and completes after final text", async () => {
    const bridge = createBridge();
    const session = createSession();
    const firstReply = createReply();

    const initial = bridge.start(
      session.session,
      "[User]: inspect files",
      "gpt-5",
      firstReply.reply,
      new Stats(),
    );
    session.emit(externalTool("call_1", "request_1"));
    session.emit(externalTool("call_2", "request_2"));
    await publishToolCalls();

    const firstBody = firstReply.chunks.join("");
    expect(firstBody).toContain("event: response.output_item.added");
    expect(firstBody).toContain('"call_id":"call_1"');
    expect(firstBody).toContain('"call_id":"call_2"');
    expect(firstBody).toContain("event: response.completed");
    expect(firstReply.close).not.toThrow();

    const continuationReply = createReply();
    const continuation = bridge.continueWith(
      [
        { call_id: "call_1", output: "first result" },
        { call_id: "call_2", output: "second result" },
      ],
      "gpt-5",
      continuationReply.reply,
      new Stats(),
    );
    await vi.waitFor(() =>
      expect(session.handleResult).toHaveBeenCalledTimes(2),
    );
    session.emit(textDelta("All done."));
    session.emit(idle());

    await expect(continuation).resolves.toBe(true);
    await expect(initial).resolves.toBe(true);
    expect(session.handleResult).toHaveBeenNthCalledWith(1, {
      requestId: "request_1",
      result: "first result",
    });
    expect(session.handleResult).toHaveBeenNthCalledWith(2, {
      requestId: "request_2",
      result: "second result",
    });
    expect(continuationReply.chunks.join("")).toContain("All done.");
    expect(continuationReply.chunks.join("")).toContain(
      "event: response.completed",
    );
  });

  it("keeps pending calls isolated by their correlated call_id", async () => {
    const logger = new Logger("none");
    const registry = new CodexToolBridgeRegistry(logger, 1000);
    const tools: Tool<Record<string, unknown>>[] = [{ name: "read_file" }];
    const first = registry.prepare(conversation("first"), tools);
    const second = registry.prepare(conversation("second"), tools);
    const firstSession = createSession();
    const secondSession = createSession();

    void first.start(
      firstSession.session,
      "first",
      "gpt-5",
      createReply().reply,
      new Stats(),
    );
    void second.start(
      secondSession.session,
      "second",
      "gpt-5",
      createReply().reply,
      new Stats(),
    );
    firstSession.emit(externalTool("call_first", "request_first"));
    secondSession.emit(externalTool("call_second", "request_second"));
    await publishToolCalls();

    expect(
      registry.findForOutputs([
        { call_id: "call_first", output: "a" },
        { call_id: "call_second", output: "b" },
      ]).hasConflictingCalls,
    ).toBe(true);
    expect(
      registry.findForOutputs([{ call_id: "call_second", output: "b" }]).bridge,
    ).toBe(second);
  });

  it("batches calls that arrive on adjacent event-loop ticks", async () => {
    const bridge = createBridge();
    const session = createSession();
    const reply = createReply();
    const initial = bridge.start(
      session.session,
      "prompt",
      "gpt-5",
      reply.reply,
      new Stats(),
    );

    session.emit(externalTool("call_first", "request_first"));
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        session.emit(externalTool("call_second", "request_second"));
        resolve();
      }, 5);
    });
    await publishToolCalls();

    const body = reply.chunks.join("");
    expect(body).toContain('"call_id":"call_first"');
    expect(body).toContain('"call_id":"call_second"');

    const continuationReply = createReply();
    const continuation = bridge.continueWith(
      [
        { call_id: "call_first", output: "first result" },
        { call_id: "call_second", output: "second result" },
      ],
      "gpt-5",
      continuationReply.reply,
      new Stats(),
    );
    await vi.waitFor(() =>
      expect(session.handleResult).toHaveBeenCalledTimes(2),
    );
    session.emit(idle());

    await expect(initial).resolves.toBe(true);
    await expect(continuation).resolves.toBe(true);
  });

  it("supports a second function call after the first output resumes the session", async () => {
    const bridge = createBridge();
    const session = createSession();
    const firstReply = createReply();
    const initial = bridge.start(
      session.session,
      "prompt",
      "gpt-5",
      firstReply.reply,
      new Stats(),
    );

    session.emit(externalTool("call_first", "request_first"));
    await publishToolCalls();

    const secondReply = createReply();
    const firstContinuation = bridge.continueWith(
      [{ call_id: "call_first", output: "first result" }],
      "gpt-5",
      secondReply.reply,
      new Stats(),
    );
    await vi.waitFor(() => expect(session.handleResult).toHaveBeenCalledOnce());
    session.emit(externalTool("call_second", "request_second"));
    await publishToolCalls();

    expect(secondReply.chunks.join("")).toContain('"call_id":"call_second"');

    const finalReply = createReply();
    const finalContinuation = bridge.continueWith(
      [{ call_id: "call_second", output: "second result" }],
      "gpt-5",
      finalReply.reply,
      new Stats(),
    );
    await vi.waitFor(() =>
      expect(session.handleResult).toHaveBeenCalledTimes(2),
    );
    session.emit(textDelta("Finished after two calls."));
    session.emit(idle());

    await expect(initial).resolves.toBe(true);
    await expect(firstContinuation).resolves.toBe(true);
    await expect(finalContinuation).resolves.toBe(true);
    expect(finalReply.chunks.join("")).toContain("Finished after two calls.");
  });

  it("aborts and clears pending state when a function output times out", async () => {
    const bridge = createBridge(5);
    const session = createSession();
    const reply = createReply();
    const initial = bridge.start(
      session.session,
      "prompt",
      "gpt-5",
      reply.reply,
      new Stats(),
    );

    session.emit(externalTool("call_timeout", "request_timeout"));
    await publishToolCalls();

    await expect(initial).resolves.toBe(false);
    expect(session.abort).toHaveBeenCalledOnce();
    expect(bridge.hasPendingCalls).toBe(false);
  });

  it("cancels the session when an active client response disconnects", async () => {
    const bridge = createBridge();
    const session = createSession();
    const reply = createReply();
    const initial = bridge.start(
      session.session,
      "prompt",
      "gpt-5",
      reply.reply,
      new Stats(),
    );

    reply.close();

    await expect(initial).resolves.toBe(false);
    expect(session.abort).toHaveBeenCalledOnce();
  });
});

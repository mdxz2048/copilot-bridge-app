import type { Tool } from "@github/copilot-sdk";
import type { Provider } from "#providers/types.js";
import { createResponsesHandler } from "#providers/codex/handler.js";
import {
  extractFunctionCallOutputs,
  extractResponsesAttachments,
} from "#providers/codex/prompt.js";
import { filterFunctionTools, genId } from "#providers/codex/schemas.js";
import { handleResponsesStreaming } from "#providers/codex/streaming.js";
import { CodexToolBridgeRegistry } from "#providers/codex/tool-bridge.js";
import {
  DefaultConversationManager,
  type Conversation,
} from "#conversation-manager.js";
import { sendOpenAIError } from "#providers/shared/errors.js";
import { createSessionConfig } from "#providers/shared/session-config.js";
import { createModelsHandler } from "#providers/openai/models.js";

function toSdkTools(
  tools: ReturnType<typeof filterFunctionTools>,
): Tool<Record<string, unknown>>[] {
  return tools.map((tool) => ({
    name: tool.name,
    ...(tool.description && { description: tool.description }),
    ...(tool.parameters && { parameters: tool.parameters }),
    overridesBuiltInTool: true,
    skipPermission: true,
  }));
}

export const codexProvider = {
  name: "Codex",
  routes: ["GET /v1/models", "POST /v1/responses"],

  register(app, ctx) {
    const manager = new DefaultConversationManager(ctx.logger);
    const bridges = new CodexToolBridgeRegistry(
      ctx.logger,
      ctx.config.requestTimeoutMs,
    );

    app.get("/v1/models", createModelsHandler(ctx));
    app.post(
      "/v1/responses",
      createResponsesHandler(ctx, manager, {
        beforeHandler: async (req, reply) => {
          const outputs = extractFunctionCallOutputs(req.input);
          if (outputs.length === 0) return false;

          const { bridge, hasConflictingCalls } =
            bridges.findForOutputs(outputs);
          if (hasConflictingCalls) {
            sendOpenAIError(
              reply,
              400,
              "invalid_request_error",
              "function_call_output items must belong to one pending response",
            );
            return true;
          }
          if (!bridge) return false;

          try {
            await bridge.continueWith(outputs, req.model, reply, ctx.stats);
          } catch (err) {
            sendOpenAIError(
              reply,
              400,
              "invalid_request_error",
              err instanceof Error
                ? err.message
                : "Invalid function_call_output",
            );
          }
          return true;
        },

        onConversationReady: (conversation, req) => {
          const tools = req.tools ? filterFunctionTools(req.tools) : [];
          if (tools.length > 0) {
            bridges.prepare(conversation, toSdkTools(tools));
          }
        },

        createSessionConfig: (baseOptions, conversation) => {
          const bridge = bridges.get(conversation);
          return createSessionConfig({
            ...baseOptions,
            ...(bridge && { tools: bridge.tools }),
          });
        },

        handleStreaming: async ({
          conversation,
          session,
          prompt,
          model,
          reply,
          req,
        }) => {
          const bridge = bridges.get(conversation);
          const message = {
            prompt,
            attachments: extractResponsesAttachments(req.input),
          };
          const healthy = bridge
            ? await bridge.start(session, message, model, reply, ctx.stats)
            : await handleResponsesStreaming(
                session,
                message,
                model,
                reply,
                genId("resp"),
                ctx.logger,
                ctx.stats,
              );
          finishConversation(
            conversation,
            manager,
            healthy,
            Array.isArray(req.input) ? req.input.length : 1,
          );
        },
      }),
    );
  },
} satisfies Provider;

function finishConversation(
  conversation: Conversation,
  manager: DefaultConversationManager,
  healthy: boolean,
  messageCount: number,
): void {
  if (healthy) {
    conversation.sentMessageCount = messageCount;
    return;
  }
  conversation.hadError = true;
  if (conversation.isPrimary) {
    manager.clearPrimary();
  }
}

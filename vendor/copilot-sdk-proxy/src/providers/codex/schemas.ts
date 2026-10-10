import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ResponsesRequestSchema as BaseResponsesRequestSchema,
  FunctionToolSchema,
  type FunctionTool,
  type InputItem as BaseInputItem,
  type FunctionCallOutput,
} from "llm-schemas/openai/responses";

export type InputItem = BaseInputItem;
export type { FunctionCallOutput };

export function filterFunctionTools(
  tools: Record<string, unknown>[],
): FunctionTool[] {
  return tools
    .filter((t) => t.type === "function")
    .map((t) => FunctionToolSchema.parse(t));
}

function stripReasoningItems(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const request = value as Record<string, unknown>;
  if (!Array.isArray(request.input)) return value;
  const input = request.input.filter(
    (item) =>
      !item ||
      typeof item !== "object" ||
      !("type" in item) ||
      (item.type !== "reasoning" && item.type !== "compaction"),
  );
  return input.length === request.input.length ? value : { ...request, input };
}

// Model and input are optional in the spec but required by the proxy. Reasoning
// items are provider-internal history and do not have message content to relay.
export const ResponsesRequestSchema = z.preprocess(
  stripReasoningItems,
  BaseResponsesRequestSchema,
).refine(
  (
    data,
  ): data is typeof data & { model: string; input: string | BaseInputItem[] } =>
    typeof data.model === "string" &&
    data.model.length > 0 &&
    data.input != null,
  { message: "Model and input are required" },
);

export type ResponsesRequest = z.infer<typeof BaseResponsesRequestSchema> & {
  model: string;
  input: string | InputItem[];
};

export interface MessageContent {
  type: "output_text";
  text: string;
  annotations: unknown[];
}

export interface MessageOutputItem {
  type: "message";
  id: string;
  status: "in_progress" | "completed";
  role: "assistant";
  content: MessageContent[];
}

export interface FunctionCallOutputItem {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status: "in_progress" | "completed";
}

export interface ReasoningSummary {
  type: "summary_text";
  text: string;
}

export interface ReasoningOutputItem {
  type: "reasoning";
  id: string;
  summary: ReasoningSummary[];
  status: "in_progress" | "completed";
}

export type OutputItem =
  | MessageOutputItem
  | FunctionCallOutputItem
  | ReasoningOutputItem;

export interface ResponseObject {
  id: string;
  object: "response";
  created_at: number;
  model: string;
  status: "in_progress" | "completed" | "incomplete" | "failed";
  output: OutputItem[];
  error?: { code: string; message: string } | null;
}

export { currentTimestamp } from "#providers/shared/streaming-utils.js";

export function genId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

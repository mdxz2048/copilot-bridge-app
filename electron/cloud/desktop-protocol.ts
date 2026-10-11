import { CloudError } from "./cloud-error.js";
import type { ResponseRequest } from "./contract.js";

/** Normalize the official runtime wire shape before the frozen Cloud function contract. */
export type DesktopToolBinding = { name: string; namespace?: string; custom: boolean };
export function normalizeDesktopRequest(value: unknown, native = false): { request: ResponseRequest; customTools: Set<string>; toolBindings: Map<string, DesktopToolBinding> } {
  if (!value || typeof value !== "object") throw new Error("Invalid Desktop request");
  const raw = value as Record<string, unknown>;
  const customTools = new Set<string>();
  const toolBindings = new Map<string, DesktopToolBinding>();
  const tools: Record<string, unknown>[] = [];
  const addTools = (values: unknown[], namespace?: string): void => {
    for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const tool = value as Record<string, unknown>;
    if (tool.type === "namespace" && typeof tool.name === "string" && Array.isArray(tool.tools)) {
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
    }
  }
  const callName = (item: Record<string, unknown>): unknown => [...toolBindings].find(([alias, binding]) =>
    (binding.name === item.name && binding.namespace === item.namespace) || alias === item.name)?.[0] ?? item.name;
  const input = Array.isArray(raw.input) ? raw.input.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new CloudError("VALIDATION_ERROR", "Invalid input item.", { httpStatus: 400 });
    const item = value as Record<string, unknown>;
    if (item.type === "additional_tools") return [];
    if (item.type === "function_call") return [{ ...item, name: callName(item) }];
    if (native && item.type === "custom_tool_call" && item.name === "apply_patch" && !item.namespace) return [item];
    if (item.type === "custom_tool_call") return [{ type: "function_call", name: callName(item), call_id: item.call_id, arguments: JSON.stringify({ input: item.input }) }];
    if (native && item.type === "custom_tool_call_output") return [item];
    if (item.type === "custom_tool_call_output") return [{ type: "function_call_output", call_id: item.call_id,
      output: typeof item.output === "string" ? item.output : JSON.stringify(item.output) }];
    return [item];
  }) : raw.input;
  return { request: { ...raw, tools: tools.length ? tools : undefined, input } as ResponseRequest, customTools, toolBindings };
}

export function desktopOutputItem(value: unknown, customTools: Set<string>, toolBindings?: Map<string, DesktopToolBinding>): unknown {
  if (!value || typeof value !== "object") return value;
  const item = value as Record<string, unknown>;
  if (item.type !== "function_call") return item;
  const binding = toolBindings?.get(String(item.name));
  const restored = binding ? { ...item, name: binding.name, ...(binding.namespace ? { namespace: binding.namespace } : {}) } : item;
  if (!customTools.has(String(item.name))) return restored;
  const args = JSON.parse(String(item.arguments ?? "{}")) as { input?: string };
  if (typeof args.input !== "string") throw new Error("Custom tool input missing");
  const { arguments: _arguments, ...rest } = restored;
  return { ...rest, type: "custom_tool_call", input: args.input };
}

export function desktopEvent(value: unknown, customTools: Set<string>, toolBindings?: Map<string, DesktopToolBinding>): unknown {
  if (!value || typeof value !== "object") return value;
  const event = value as Record<string, unknown>;
  const response = event.response as Record<string, unknown> | undefined;
  return { ...event, ...(event.item ? { item: desktopOutputItem(event.item, customTools, toolBindings) } : {}),
    ...(response ? { response: { ...response, ...(Array.isArray(response.output) ? { output: response.output.map(item => desktopOutputItem(item, customTools, toolBindings)) } : {}) } } : {}) };
}

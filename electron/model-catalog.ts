import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Minimal structural view of the Cloud catalog row used to build a Codex model catalog. */
export type CatalogSourceModel = {
  id: string;
  availability?: "READY" | "SETUP_REQUIRED" | "UNAVAILABLE";
  statusMessage?: string;
  displayName?: string;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  effectiveContextWindowPercent?: number;
  supportsVision?: boolean;
  supportsReasoningEffort: boolean;
};

const BASE_INSTRUCTIONS = "You are a careful coding assistant running in a desktop workspace. Help the user complete their task. Follow the applicable system and developer instructions and repository guidance. Use available tools to inspect, edit, and verify work when requested. Protect credentials. Report results and material limitations clearly. Answer in the user's language.";

const fallbackContextWindow = (id: string) => id.startsWith("bailian/") ? 1_000_000
  : id.startsWith("openai/") ? 272_000
  : id.startsWith("deepseek/") ? 128_000
  : 272_000;

const effectivePercent = (id: string) => id.startsWith("bailian/") ? 75 : 95;

type CatalogModel = Record<string, unknown> & { slug: string };
export type ModelCatalog = { models: CatalogModel[] };

function catalogEntry(model: CatalogSourceModel, index: number): CatalogModel {
  const displayName = model.displayName ?? model.id.split("/").at(-1)!.replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
  const contextWindow = model.contextWindow ?? fallbackContextWindow(model.id);
  const percent = model.effectiveContextWindowPercent ?? effectivePercent(model.id);
  const reasoning = model.supportsReasoningEffort === true;
  return {
    slug: model.id,
    display_name: displayName,
    description: `${displayName} · Copilot Bridge`,
    default_reasoning_level: reasoning ? "medium" : "none",
    supported_reasoning_levels: reasoning ? [
      { effort: "low", description: "快速" },
      { effort: "medium", description: "平衡" },
      { effort: "high", description: "深入思考" },
    ] : [],
    shell_type: "unified_exec",
    visibility: "list",
    supported_in_api: true,
    priority: index + 1,
    additional_speed_tiers: [],
    service_tiers: [],
    include_skills_usage_instructions: false,
    include_plugin_usage_instructions: false,
    include_apps_usage_instructions: false,
    default_reasoning_summary: "none",
    support_verbosity: false,
    default_verbosity: null,
    apply_patch_tool_type: "freeform",
    web_search_tool_type: "text",
    truncation_policy: { mode: "tokens", limit: 10_000 },
    supports_image_detail_original: false,
    context_window: contextWindow,
    max_context_window: contextWindow,
    effective_context_window_percent: percent,
    auto_compact_token_limit: null,
    experimental_supported_tools: [],
    input_modalities: model.supportsVision === true ? ["text", "image"] : ["text"],
    supports_search_tool: false,
    supports_experimental_context: false,
    use_responses_lite: false,
    supports_reasoning_effort_updates: false,
    node_repl_auto_review_required: false,
    node_repl_disabled: false,
    base_instructions: BASE_INSTRUCTIONS,
  };
}

/** Build a per-user catalog containing only models that are currently usable. */
export function buildModelCatalog(models: CatalogSourceModel[]): ModelCatalog {
  return { models: models.filter(model => !model.availability || model.availability === "READY").map(catalogEntry) };
}

export function catalogHash(catalog: ModelCatalog): string {
  return createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
}

async function atomicWrite(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

/** Write only when the user's authorized model set changed. */
export async function syncModelCatalog(path: string, models: CatalogSourceModel[]): Promise<{ changed: boolean; hash: string; count: number }> {
  const catalog = buildModelCatalog(models);
  const text = JSON.stringify(catalog, null, 2);
  const hash = catalogHash(catalog);
  let current = "";
  try { current = await readFile(path, "utf8"); } catch { current = ""; }
  if (current !== text) await atomicWrite(path, text);
  return { changed: current !== text, hash, count: catalog.models.length };
}

export function catalogModelIds(path: string): Promise<string[]> {
  return readFile(path, "utf8").then(text => (JSON.parse(text) as ModelCatalog).models.map(model => model.slug)).catch(() => []);
}

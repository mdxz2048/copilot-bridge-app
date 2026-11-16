import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse, stringify } from "smol-toml";
import type { ProfileId, ProfileStatus } from "./profile-store.js";
import { catalogModelIds } from "./model-catalog.js";

type Snapshot = { original: string; existed: boolean; appliedHash: string; active: boolean; pending: ProfileId | null; providerId?: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const BRIDGE_PROVIDER_ID = "copilot_bridge_desktop";

/** Saved threads keep their provider ID. In Original mode resolve that ID with
 * OpenAI's own auth and automatic API/ChatGPT endpoint selection, never loopback. */
export function originalProviderCompatibility(text: string, providerId?: string): string {
  if(providerId!==BRIDGE_PROVIDER_ID)return text;
  const config=parse(text);
  if(isRecord(config.model_providers)&&Object.hasOwn(config.model_providers,providerId))return text;
  if(typeof config.model_provider==="string"&&config.model_provider!=="openai")return text;
  const newline=text.includes("\r\n")?"\r\n":"\n";
  return text+(text.endsWith("\n")?"":newline)+[
    "", "# Keep previously saved Bridge threads resumable using the original OpenAI account.",
    `[model_providers.${providerId}]`, 'name = "OpenAI"', 'wire_api = "responses"',
    'requires_openai_auth = true', 'supports_websockets = true', "",
  ].join(newline);
}

function bridgeConfiguration(
  original: string,
  providerId: string,
  helperCommand: string,
  helperArgs: string[],
  endpoint: string,
  catalogPath?: string,
  selectedModel?: string | null,
): string {
  const parsed = parse(original);
  let baseline = original;
  if (parsed.model_providers && typeof parsed.model_providers === "object" && providerId in parsed.model_providers) {
    const preserved = parse(original);
    delete (preserved.model_providers as Record<string, unknown>)[providerId];
    baseline = stringify(preserved);
  }
  const lines = baseline.split(/\r?\n/);
  const firstTable = lines.findIndex(line => /^\s*\[/.test(line));
  const rootEnd = firstTable < 0 ? lines.length : firstTable;
  const root = lines.slice(0, rootEnd).filter(line => !/^\s*(?:model|model_provider|model_catalog_json)\s*=/.test(line));
  const model = selectedModel ?? (typeof parsed.model === "string" ? parsed.model : "gpt-5.5");
  const applied = [`model = ${JSON.stringify(model)}`, `model_provider = ${JSON.stringify(providerId)}`,
    ...(catalogPath ? [`model_catalog_json = ${JSON.stringify(catalogPath)}`] : []), ...root,
    ...lines.slice(rootEnd), "", `[model_providers.${JSON.stringify(providerId)}]`, 'name = "Copilot Bridge"',
    `base_url = ${JSON.stringify(endpoint)}`, 'wire_api = "responses"', 'supports_websockets = false', 'requires_openai_auth = false',
    'request_max_retries = 0', 'stream_max_retries = 0', 'stream_idle_timeout_ms = 300000',
    "", `[model_providers.${JSON.stringify(providerId)}.auth]`, `command = ${JSON.stringify(helperCommand)}`,
    `args = ${JSON.stringify(helperArgs)}`, "timeout_ms = 15000", "refresh_interval_ms = 300000", ""].join("\n");
  parse(applied);
  return applied;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeConfigurationChanges(
  original: Record<string, unknown>,
  expected: Record<string, unknown>,
  current: Record<string, unknown>,
  providerId: string,
  path: string[] = [],
): Record<string, unknown> {
  const merged = { ...original };
  const keys = new Set([...Object.keys(expected), ...Object.keys(current)]);
  for (const key of keys) {
    const childPath = [...path, key];
    if (childPath.length === 1 && (key === "model" || key === "model_provider")) continue;
    if (childPath.length === 1 && key === "model_catalog_json") {
      if (Object.hasOwn(original, key)) merged[key] = original[key];
      else delete merged[key];
      continue;
    }
    if (childPath.length === 2 && childPath[0] === "model_providers" && key === providerId) continue;

    const hadExpected = Object.hasOwn(expected, key);
    const hasCurrent = Object.hasOwn(current, key);
    if (hadExpected === hasCurrent
      && (!hadExpected || isDeepStrictEqual(expected[key], current[key]))) continue;

    const originalValue = original[key];
    const expectedValue = expected[key];
    const currentValue = current[key];
    if (childPath.length === 1 && key === "model_providers" && isRecord(expectedValue) && !hasCurrent) {
      const providers = mergeConfigurationChanges(isRecord(originalValue) ? originalValue : {}, expectedValue, {}, providerId, childPath);
      if (Object.keys(providers).length) merged[key] = providers;
      else delete merged[key];
      continue;
    }
    if (hasCurrent && isRecord(expectedValue) && isRecord(currentValue)) {
      merged[key] = mergeConfigurationChanges(
        isRecord(originalValue) ? originalValue : {},
        expectedValue,
        currentValue,
        providerId,
        childPath,
      );
    } else if (hasCurrent) {
      merged[key] = currentValue;
    } else {
      delete merged[key];
    }
  }
  return merged;
}

/** Switch only the model connection. Session storage and user environment stay intact. */
export class GatewayProfileStore {
  private mutations: Promise<void> = Promise.resolve();
  private readonly codexHome: string;
  private readonly statePath: string;
  private readonly helperCommand: string;
  private readonly helperArgs: string[];
  private readonly endpoint: string;
  private readonly catalogPath?: string;
  constructor(codexHome: string, statePath: string, helperCommand: string, helperArgs: string[], endpoint = "http://127.0.0.1:8787/v1", catalogPath?: string) {
    this.codexHome = codexHome; this.statePath = statePath; this.helperCommand = helperCommand; this.helperArgs = helperArgs; this.endpoint = endpoint; this.catalogPath = catalogPath;
  }

  async getStatus(): Promise<ProfileStatus> {
    const snapshot = await this.snapshot();
    const current = await this.configuration();
    const config = parse(current.text);
    const selected = typeof config.model_provider === "string" ? config.model_provider : "openai";
    const providers = config.model_providers as Record<string, { base_url?: string }> | undefined;
    const active = snapshot?.active === true && providers?.[selected]?.base_url === this.endpoint;
    return { activeProfile: active ? "bridge" : "original", bridgeHome: this.codexHome,
      originalState: current.existed ? "READY" : "UNINITIALIZED", restartRequired: snapshot?.pending != null,
      pendingProfile: snapshot?.pending ?? null, unrestrictedBridgeAccess: false };
  }

  activate(target: ProfileId, selectedModel?: string | null): Promise<ProfileStatus> {
    return this.serialize(() => this.performActivate(target, selectedModel));
  }

  private async performActivate(target: ProfileId, selectedModel?: string | null): Promise<ProfileStatus> {
    const previous = await this.snapshot();
    const current = await this.configuration();
    if (target === "original") {
      if (!previous?.active) {
        const repaired=originalProviderCompatibility(current.text,previous?.providerId);
        if(repaired!==current.text)await this.writeConfiguration(repaired);
        return this.getStatus();
      }
      const restored = originalProviderCompatibility(this.restoreConfiguration(previous, current.text),previous.providerId);
      await this.save({ ...previous, active: false, pending: "original" });
      try { await this.writeConfiguration(restored); }
      catch (error) { await this.save(previous); throw error; }
      return this.getStatus();
    }
    if (previous?.active) {
      await this.reconcileActive(previous, current.text, selectedModel);
      return this.getStatus();
    }
    const parsed = parse(current.text);
    // Reuse an existing custom provider. Built-in OpenAI provider IDs cannot be overridden.
    const selectedProvider = typeof parsed.model_provider === "string" ? parsed.model_provider : "openai";
    const providerId = parsed.model_providers && typeof parsed.model_providers === "object" && selectedProvider in parsed.model_providers
      ? selectedProvider : "copilot_bridge_desktop";
    const applied = bridgeConfiguration(current.text, providerId, this.helperCommand, this.helperArgs, this.endpoint, this.catalogPath, selectedModel);
    await this.save({ original: current.text, existed: current.existed, appliedHash: hash(applied), active: true, pending: "bridge", providerId });
    try { await this.writeConfiguration(applied); }
    catch (error) {
      await this.save({ original: current.text, existed: current.existed, appliedHash: hash(applied), active: false, pending: null, providerId });
      throw error;
    }
    return this.getStatus();
  }

  acknowledgeBridgeActivity(): Promise<ProfileStatus> {
    return this.serialize(async () => {
      const status = await this.getStatus();
      if (status.activeProfile === 'bridge' && status.pendingProfile === 'bridge') return this.performAcknowledgeRestart();
      return status;
    });
  }

  /** The catalog file changed on disk; the running client must restart to reload it. */
  markRestartRequired(): Promise<ProfileStatus> {
    return this.serialize(async () => {
      const snapshot = await this.snapshot();
      if (!snapshot?.active) return this.getStatus();
      await this.save({ ...snapshot, pending: "bridge" });
      return this.getStatus();
    });
  }

  /**
   * Bridge owns the provider block, retry policy, catalog path and default
   * model. Rebuild those fields from the saved original while preserving
   * unrelated user edits, then require one restart if anything changed.
   */
  reconcile(selectedModel?: string | null): Promise<{ status: ProfileStatus; changed: boolean }> {
    return this.serialize(async () => {
      const snapshot = await this.snapshot();
      if (!snapshot?.active) return { status: await this.getStatus(), changed: false };
      const current = await this.configuration();
      const result = await this.reconcileActive(snapshot, current.text, selectedModel);
      return { status: await this.getStatus(), changed: result.changed };
    });
  }

  private async reconcileActive(snapshot: Snapshot, text: string, selectedModel?: string | null): Promise<{ text: string; changed: boolean }> {
    if (!snapshot.providerId) return { text, changed: false };
    const original = this.restoreConfiguration(snapshot, text);
    const current = parse(text);
    const currentModel = typeof current.model === "string" ? current.model : undefined;
    const catalogIds = this.catalogPath ? await catalogModelIds(this.catalogPath) : [];
    const model = currentModel && catalogIds.includes(currentModel) ? currentModel : selectedModel ?? currentModel;
    const applied = bridgeConfiguration(original, snapshot.providerId, this.helperCommand, this.helperArgs, this.endpoint, this.catalogPath, model);
    if (isDeepStrictEqual(current, parse(applied))) {
      if (snapshot.appliedHash !== hash(text)) await this.save({ ...snapshot, appliedHash: hash(text) });
      return { text, changed: false };
    }
    await this.save({ ...snapshot, original, appliedHash: hash(applied), pending: "bridge" });
    await this.writeConfiguration(applied);
    return { text: applied, changed: true };
  }

  acknowledgeRestart(): Promise<ProfileStatus> {
    return this.serialize(() => this.performAcknowledgeRestart());
  }

  private async performAcknowledgeRestart(): Promise<ProfileStatus> {
    const snapshot = await this.snapshot();
    if (snapshot) await this.save({ ...snapshot, pending: null });
    return this.getStatus();
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.mutations.then(action);
    this.mutations = next.then(() => undefined, () => undefined);
    return next;
  }

  private restoreConfiguration(snapshot: Snapshot, text: string): string {
    if (hash(text) === snapshot.appliedHash) return snapshot.original;
    if (!snapshot.providerId) {
      throw new Error("无法安全恢复 ChatGPT 配置：缺少 Bridge 配置记录。");
    }
    const original = parse(snapshot.original);
      const expected = parse(bridgeConfiguration(snapshot.original, snapshot.providerId, this.helperCommand, this.helperArgs, this.endpoint, this.catalogPath));
    const current = parse(text);
    if (isDeepStrictEqual(current, expected)) return snapshot.original;
    const merged = mergeConfigurationChanges(original, expected, current, snapshot.providerId);
    return `${stringify(merged)}\n`;
  }
  private async configuration() {
    try { return { text: await readFile(join(this.codexHome, "config.toml"), "utf8"), existed: true }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { text: "", existed: false }; throw error; }
  }
  private async snapshot(): Promise<Snapshot | null> {
    try { return JSON.parse(await readFile(this.statePath, "utf8")) as Snapshot; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  private save(snapshot: Snapshot) { return atomicWrite(this.statePath, JSON.stringify(snapshot, null, 2)); }
  private writeConfiguration(text: string) { return atomicWrite(join(this.codexHome, "config.toml"), text); }
}

async function atomicWrite(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

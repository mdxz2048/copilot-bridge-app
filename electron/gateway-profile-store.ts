import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse, stringify } from "smol-toml";
import type { ProfileId, ProfileStatus } from "./profile-store.js";

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
  const root = lines.slice(0, rootEnd).filter(line => !/^\s*(?:model|model_provider)\s*=/.test(line));
  const model = typeof parsed.model === "string" ? parsed.model : "gpt-5.5";
  const applied = [`model = ${JSON.stringify(model)}`, `model_provider = ${JSON.stringify(providerId)}`, ...root,
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
  private readonly codexHome: string;
  private readonly statePath: string;
  private readonly helperCommand: string;
  private readonly helperArgs: string[];
  private readonly endpoint: string;
  constructor(codexHome: string, statePath: string, helperCommand: string, helperArgs: string[], endpoint = "http://127.0.0.1:8787/v1") {
    this.codexHome = codexHome; this.statePath = statePath; this.helperCommand = helperCommand; this.helperArgs = helperArgs; this.endpoint = endpoint;
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

  async activate(target: ProfileId): Promise<ProfileStatus> {
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
      this.checkConflict(previous, current.text);
      const selected = previous.providerId;
      const parsed = parse(current.text);
      const provider = selected ? (parsed.model_providers as Record<string, Record<string, unknown>> | undefined)?.[selected] : undefined;
      if (selected && provider && (provider.request_max_retries !== 0 || provider.stream_max_retries !== 0 || provider.stream_idle_timeout_ms !== 300000)) {
        const original = this.restoreConfiguration(previous, current.text);
        const applied = bridgeConfiguration(original, selected, this.helperCommand, this.helperArgs, this.endpoint);
        await this.save({ ...previous, original, appliedHash: hash(applied), pending: "bridge" });
        try { await this.writeConfiguration(applied); }
        catch (error) { await this.save(previous); throw error; }
      }
      return this.getStatus();
    }
    const parsed = parse(current.text);
    // Reuse an existing custom provider. Built-in OpenAI provider IDs cannot be overridden.
    const selectedProvider = typeof parsed.model_provider === "string" ? parsed.model_provider : "openai";
    const providerId = parsed.model_providers && typeof parsed.model_providers === "object" && selectedProvider in parsed.model_providers
      ? selectedProvider : "copilot_bridge_desktop";
    const applied = bridgeConfiguration(current.text, providerId, this.helperCommand, this.helperArgs, this.endpoint);
    await this.save({ original: current.text, existed: current.existed, appliedHash: hash(applied), active: true, pending: "bridge", providerId });
    try { await this.writeConfiguration(applied); }
    catch (error) {
      await this.save({ original: current.text, existed: current.existed, appliedHash: hash(applied), active: false, pending: null, providerId });
      throw error;
    }
    return this.getStatus();
  }

  async acknowledgeRestart(): Promise<ProfileStatus> {
    const snapshot = await this.snapshot();
    if (snapshot) await this.save({ ...snapshot, pending: null });
    return this.getStatus();
  }

  private restoreConfiguration(snapshot: Snapshot, text: string): string {
    if (hash(text) === snapshot.appliedHash) return snapshot.original;
    if (!snapshot.providerId) {
      throw new Error("无法安全恢复 ChatGPT 配置：缺少 Bridge 配置记录。");
    }
    const original = parse(snapshot.original);
    const expected = parse(bridgeConfiguration(snapshot.original, snapshot.providerId, this.helperCommand, this.helperArgs, this.endpoint));
    const current = parse(text);
    if (isDeepStrictEqual(current, expected)) return snapshot.original;
    const merged = mergeConfigurationChanges(original, expected, current, snapshot.providerId);
    return `${stringify(merged)}\n`;
  }
  private checkConflict(snapshot: Snapshot, text: string) {
    if (hash(text) === snapshot.appliedHash) return;
    if (snapshot.providerId) {
      const expected = bridgeConfiguration(snapshot.original, snapshot.providerId, this.helperCommand, this.helperArgs, this.endpoint);
      const current = parse(text);
      const applied = parse(expected);
      const currentProviders = current.model_providers as Record<string, unknown> | undefined;
      const appliedProviders = applied.model_providers as Record<string, unknown> | undefined;
      const expectedProvider = { ...(appliedProviders?.[snapshot.providerId] as Record<string, unknown> | undefined) };
      const currentProvider = currentProviders?.[snapshot.providerId] as Record<string, unknown> | undefined;
      // Older Bridge versions did not write these owned retry fields.
      for (const key of ["request_max_retries", "stream_max_retries", "stream_idle_timeout_ms"]) {
        if (currentProvider?.[key] === undefined) delete expectedProvider[key];
      }
      if (current.model === applied.model && current.model_provider === applied.model_provider
        && isDeepStrictEqual({ ...currentProvider }, expectedProvider)) return;
    }
    throw new Error("Bridge 模型连接配置在切换后被修改，已保留现有内容。请先恢复原账号再重新启用 Bridge。");
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

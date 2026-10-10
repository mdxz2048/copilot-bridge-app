import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse, stringify } from "smol-toml";
import { GatewayProfileStore } from "../dist-electron/gateway-profile-store.js";

test("switches gateway with an app restart and restores original config byte for byte", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bridge-gateway-"));
  try {
    const original = '# keep my comments\r\nmodel = "my-model"\r\nsandbox_mode = "workspace-write"\r\n[features]\r\nfoo = true\r\n';
    await writeFile(join(directory, "config.toml"), original);
    const store = new GatewayProfileStore(directory, join(directory, "switch.json"), "C:\\runtime\\node.exe", ["C:\\bridge\\helper.js", "local-target"]);
    const active = await store.activate("bridge");
    assert.equal(active.restartRequired, true);
    const applied = await readFile(join(directory, "config.toml"), "utf8");
    const config = parse(applied);
    assert.equal(config.sandbox_mode, "workspace-write");
    assert.equal(config.model, "my-model");
    assert.equal(config.model_provider, "copilot_bridge_desktop");
    assert.equal(config.model_providers.copilot_bridge_desktop.auth.command, "C:\\runtime\\node.exe");
    assert.equal(config.model_providers.copilot_bridge_desktop.requires_openai_auth, false);
    assert.match(applied, /keep my comments/);
    await store.acknowledgeRestart();
    assert.equal((await store.getStatus()).restartRequired, false);
    await writeFile(join(directory, "config.toml"), `${stringify(parse(applied))}\n`);
    await store.activate("original");
    assert.equal(await readFile(join(directory, "config.toml"), "utf8"), original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("restores Original while preserving ChatGPT changes outside Bridge settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bridge-gateway-conflict-"));
  try {
    const original = 'model = "my-model"\nmodel_provider = "openai"\n[features]\nfoo = true\n';
    await writeFile(join(directory, "config.toml"), original);
    const store = new GatewayProfileStore(directory, join(directory, "switch.json"), "node", ["helper"]);
    await store.activate("bridge");
    const file = join(directory, "config.toml");
    const edited = parse(await readFile(file, "utf8"));
    edited.sandbox_mode = "workspace-write";
    edited.features.foo = false;
    await writeFile(file, stringify(edited));
    await store.activate("original");
    const restored = parse(await readFile(file, "utf8"));
    assert.equal(restored.model, "my-model");
    assert.equal(restored.model_provider, "openai");
    assert.equal(restored.sandbox_mode, "workspace-write");
    assert.equal(restored.features.foo, false);
    assert.equal(restored.model_providers?.copilot_bridge_desktop, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("reuses a custom provider ID so existing custom-provider conversations can continue", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bridge-gateway-custom-"));
  try {
    const original = 'model="gpt-5.5"\nmodel_provider="company"\n[model_providers.company]\nname="Company"\nbase_url="https://example.test/v1"\nwire_api="responses"\n[model_providers.other]\nname="Other"\nbase_url="https://other.test/v1"\nwire_api="responses"\n';
    await writeFile(join(directory, "config.toml"), original);
    const store = new GatewayProfileStore(directory, join(directory, "switch.json"), "node", ["helper"]);
    await store.activate("bridge");
    const config = parse(await readFile(join(directory, "config.toml"), "utf8"));
    assert.equal(config.model_provider, "company");
    assert.equal(config.model_providers.company.base_url, "http://127.0.0.1:8787/v1");
    assert.equal(config.model_providers.other.base_url, "https://other.test/v1");
    await store.activate("original");
    assert.equal(await readFile(join(directory, "config.toml"), "utf8"), original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("re-enabling Bridge tolerates ordinary settings but rejects a changed gateway", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bridge-gateway-settings-"));
  try {
    const store = new GatewayProfileStore(directory, join(directory, "switch.json"), "node", ["helper"]);
    await store.activate("bridge");
    const file = join(directory, "config.toml");
    const edited = parse(await readFile(file, "utf8"));
    edited.model_reasoning_effort = "high";
    edited.projects = { 'C:\\work': { trust_level: "trusted" } };
    await writeFile(file, stringify(edited));
    assert.equal((await store.activate("bridge")).activeProfile, "bridge");
    edited.model_providers.copilot_bridge_desktop.base_url = "https://changed.test/v1";
    await writeFile(file, stringify(edited));
    await assert.rejects(store.activate("bridge"), /模型连接配置/);
    await store.activate("original");
    const restored = parse(await readFile(file, "utf8"));
    assert.equal(restored.model_reasoning_effort, "high");
    assert.equal(restored.projects['C:\\work'].trust_level, "trusted");
    assert.equal(restored.model_providers?.copilot_bridge_desktop, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("restores the original custom provider even if ChatGPT removed the provider table", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bridge-gateway-removed-table-"));
  try {
    const original = 'model="my-model"\nmodel_provider="company"\n[model_providers.company]\nname="Company"\nbase_url="https://company.test/v1"\nwire_api="responses"\n';
    await writeFile(join(directory, "config.toml"), original);
    const store = new GatewayProfileStore(directory, join(directory, "switch.json"), "node", ["helper"]);
    await store.activate("bridge");
    const edited = parse(await readFile(join(directory, "config.toml"), "utf8"));
    delete edited.model_providers;
    edited.model_reasoning_effort = "high";
    await writeFile(join(directory, "config.toml"), stringify(edited));
    await store.activate("original");
    const restored = parse(await readFile(join(directory, "config.toml"), "utf8"));
    assert.equal(restored.model_provider, "company");
    assert.equal(restored.model_providers.company.base_url, "https://company.test/v1");
    assert.equal(restored.model_reasoning_effort, "high");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

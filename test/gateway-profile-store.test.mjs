import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { parse, stringify } from "smol-toml";
import { GatewayProfileStore, originalProviderCompatibility } from "../dist-electron/gateway-profile-store.js";

test('repairs an already restored legacy Original configuration without login or a restart requirement',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'bridge-original-provider-repair-'));
 try {
  const original='# user settings\r\nmodel="gpt-6.1-sol"\r\n[features]\r\nfoo=true\r\n';
  const file=join(directory,'config.toml'),state=join(directory,'switch.json');await writeFile(file,original);
  await writeFile(state,JSON.stringify({original,existed:true,appliedHash:'legacy',active:false,pending:null,providerId:'copilot_bridge_desktop'}));
  const store=new GatewayProfileStore(directory,state,'missing-node',['missing-helper']);
  const status=await store.activate('original');assert.equal(status.activeProfile,'original');assert.equal(status.restartRequired,false);
  const repaired=await readFile(file,'utf8');assert.ok(repaired.startsWith(original));const provider=parse(repaired).model_providers.copilot_bridge_desktop;
  assert.deepEqual({...provider},{name:'OpenAI',wire_api:'responses',requires_openai_auth:true,supports_websockets:true});
  await store.activate('original');assert.equal(await readFile(file,'utf8'),repaired);
  await store.activate('bridge');assert.equal(parse(await readFile(file,'utf8')).model_providers.copilot_bridge_desktop.requires_openai_auth,false);
  await store.activate('original');assert.equal(await readFile(file,'utf8'),repaired);
 }finally{await rm(directory,{recursive:true,force:true})}
});

test('Original compatibility never overwrites a user provider or a different original service',()=>{
 const custom='model_provider="company"\n[model_providers.company]\nname="Company"\nbase_url="https://fixture.test"\n';
 assert.equal(originalProviderCompatibility(custom,'company'),custom);
 assert.equal(originalProviderCompatibility(custom,'copilot_bridge_desktop'),custom);
 const existing='model_provider="openai"\n[model_providers.copilot_bridge_desktop]\nname="User defined"\nbase_url="https://fixture.test"\n';
 assert.equal(originalProviderCompatibility(existing,'copilot_bridge_desktop'),existing);
});

test('repeated ON/OFF survives store recreation and retains original config and session files',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'bridge-two-mode-cycles-'));
  try{
    const file=join(directory,'config.toml'),state=join(directory,'switch.json');
    const original='# keep comments\r\nmodel="my-model"\r\n[features]\r\nfoo=true\r\n';
    await writeFile(file,original);await writeFile(join(directory,'session.jsonl'),'session unchanged');
    for(let i=0;i<8;i++){
      const store=new GatewayProfileStore(directory,state,'node',['helper']);
      assert.equal((await store.activate('bridge')).activeProfile,'bridge');
      assert.equal((await store.acknowledgeRestart()).restartRequired,false);
      const reopened=new GatewayProfileStore(directory,state,'node',['helper']);
      assert.equal((await reopened.activate('original')).pendingProfile,'original');
      assert.equal(await readFile(file,'utf8'),originalProviderCompatibility(original,'copilot_bridge_desktop'));
      assert.equal(await readFile(join(directory,'session.jsonl'),'utf8'),'session unchanged');
      await reopened.acknowledgeRestart();
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('filesystem access failure preserves active snapshot and permits retry after repair',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'bridge-mode-write-failure-'));
  try{
    const home=join(directory,'home'),file=join(home,'config.toml'),state=join(directory,'switch.json');
    await mkdir(home);const original='model="my-model"\n';await writeFile(file,original);
    const store=new GatewayProfileStore(home,state,'node',['helper']);
    await store.activate('bridge');const applied=await readFile(file,'utf8');
    // A non-directory blocks config access; the active snapshot must remain intact.
    await rename(home,join(directory,'saved-home'));await writeFile(home,'blocks directory creation');
    await assert.rejects(store.activate('original'));
    assert.equal(JSON.parse(await readFile(state,'utf8')).active,true);
    await rm(home);await rename(join(directory,'saved-home'),home);
    assert.equal(await readFile(file,'utf8'),applied);
    assert.equal((await store.activate('original')).activeProfile,'original');
    assert.equal(await readFile(file,'utf8'),originalProviderCompatibility(original,'copilot_bridge_desktop'));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test("upgrades old active Bridge retry policy and preserves original and external settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bridge-retry-upgrade-"));
  try {
    const file=join(directory,"config.toml"),state=join(directory,"switch.json");
    const original='model="my-model"\n[features]\nfoo=true\n';
    await writeFile(file,original);
    const store=new GatewayProfileStore(directory,state,"node",["helper"]);
    await store.activate("bridge");await store.acknowledgeRestart();
    const old=(await readFile(file,"utf8")).replace(/^request_max_retries.*\n|^stream_max_retries.*\n|^stream_idle_timeout_ms.*\n/gm,"");
    const snapshot=JSON.parse(await readFile(state,"utf8"));snapshot.appliedHash=createHash("sha256").update(old).digest("hex");
    await writeFile(state,JSON.stringify(snapshot));await writeFile(file,old.replace('foo=true','foo=false'));
    assert.equal((await store.activate("bridge")).restartRequired,true);
    const updated=parse(await readFile(file,"utf8"));assert.equal(updated.features.foo,false);assert.equal(updated.model_providers.copilot_bridge_desktop.request_max_retries,0);
    await store.activate("original");assert.equal(parse(await readFile(file,"utf8")).features.foo,false);assert.equal(parse(await readFile(file,"utf8")).model_provider,undefined);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("switches gateway and preserves original config bytes with a native compatibility alias", async () => {
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
    assert.equal(config.model_providers.copilot_bridge_desktop.request_max_retries, 0);
    assert.equal(config.model_providers.copilot_bridge_desktop.stream_max_retries, 0);
    assert.match(applied, /keep my comments/);
    await store.acknowledgeRestart();
    assert.equal((await store.getStatus()).restartRequired, false);
    await writeFile(join(directory, "config.toml"), `${stringify(parse(applied))}\n`);
    await store.activate("original");
    const restored=await readFile(join(directory, "config.toml"), "utf8");
    assert.ok(restored.startsWith(original));
    assert.equal(restored, originalProviderCompatibility(original,'copilot_bridge_desktop'));
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
    assert.equal(restored.model_providers.copilot_bridge_desktop.requires_openai_auth, true);
    assert.equal(restored.model_providers.copilot_bridge_desktop.base_url, undefined);
    assert.equal(restored.model_providers.copilot_bridge_desktop.auth, undefined);
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
    assert.equal(restored.model_providers.copilot_bridge_desktop.requires_openai_auth, true);
    assert.equal(restored.model_providers.copilot_bridge_desktop.base_url, undefined);
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


test("observed Bridge traffic clears its pending flag while original-mode restart stays pending", async () => {
 const directory=await mkdtemp(join(tmpdir(),"bridge-activity-"));
 try {
  const store=new GatewayProfileStore(directory,join(directory,"switch.json"),"node",["helper"]);
  await store.activate("bridge");
  const before=await readFile(join(directory,"config.toml"),"utf8");
  assert.equal((await store.acknowledgeBridgeActivity()).restartRequired,false);
  assert.equal(await readFile(join(directory,"config.toml"),"utf8"),before);
  await store.activate("original");
  const original=await store.acknowledgeBridgeActivity();
  assert.equal(original.pendingProfile,"original");assert.equal(original.restartRequired,true);
 } finally {await rm(directory,{recursive:true,force:true});}
});


test("activity acknowledgement cannot overwrite a concurrent switch to the original account",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"bridge-activity-switch-"));
 try {
  const store=new GatewayProfileStore(directory,join(directory,"switch.json"),"node",["helper"]);
  await store.activate("bridge");
  await Promise.all([store.acknowledgeBridgeActivity(),store.activate("original"),store.acknowledgeBridgeActivity()]);
  const result=await store.getStatus();assert.equal(result.activeProfile,"original");assert.equal(result.pendingProfile,"original");
 }finally{await rm(directory,{recursive:true,force:true});}
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildModelCatalog, syncModelCatalog } from "../dist-electron/model-catalog.js";

const ready=(id,extra={})=>({id,availability:"READY",supportsReasoningEffort:false,...extra});

test("builds a Codex catalog with Bailian context, vision, reasoning and only ready models",()=>{
  const catalog=buildModelCatalog([
    ready("bailian/qwen4-max",{displayName:"Qwen4 Max",contextWindow:1000000,supportsVision:true,supportsReasoningEffort:true}),
    ready("deepseek/deepseek-flash",{contextWindow:1048576}),
    {id:"bailian/glm-5.3",availability:"UNAVAILABLE",supportsReasoningEffort:false},
  ]);
  assert.equal(catalog.models.length,2);
  const qwen=catalog.models[0];
  assert.equal(qwen.slug,"bailian/qwen4-max");
  assert.equal(qwen.context_window,1000000);
  assert.equal(qwen.max_context_window,1000000);
  assert.equal(qwen.effective_context_window_percent,100);
  assert.equal(qwen.supported_reasoning_levels.length,3);
  assert.deepEqual(qwen.input_modalities,["text","image"]);
  assert.equal(qwen.visibility,"list");
  assert.ok(qwen.base_instructions.length>100);
  assert.equal(catalog.models[1].effective_context_window_percent,95);
  assert.deepEqual(catalog.models[1].supported_reasoning_levels,[]);
});

test("keeps a text-only model without image input",()=>{
  const catalog=buildModelCatalog([ready("bailian/qwen3-coder-flash",{supportsVision:false})]);
  assert.deepEqual(catalog.models[0].input_modalities,["text"]);
  assert.equal(catalog.models[0].effective_context_window_percent,100);
});

test("writes only when the authorized catalog changes and stays idempotent",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"bridge-model-catalog-"));
  try{
    const path=join(directory,"nested","catalog.json");
    const first=await syncModelCatalog(path,[ready("bailian/qwen4-max",{contextWindow:1000000,supportsReasoningEffort:true})]);
    assert.equal(first.changed,true);assert.equal(first.count,1);
    const text=await readFile(path,"utf8");assert.match(text,/"slug": "bailian\/qwen4-max"/);
    const second=await syncModelCatalog(path,[ready("bailian/qwen4-max",{contextWindow:1000000,supportsReasoningEffort:true})]);
    assert.equal(second.changed,false);assert.equal(second.hash,first.hash);
    const third=await syncModelCatalog(path,[ready("bailian/qwen4-max",{contextWindow:1000000,supportsReasoningEffort:true}),ready("bailian/kimi-k3.1-pro",{contextWindow:1000000,supportsReasoningEffort:true})]);
    assert.equal(third.changed,true);
  }finally{await rm(directory,{recursive:true,force:true});}
});

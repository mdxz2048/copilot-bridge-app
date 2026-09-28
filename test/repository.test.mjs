import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { CLOUD_CONTRACT_VERSION } from "../dist-electron/cloud/contract.js";

test("keeps the GitHub checkout self-contained", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const packageLock = await readFile("package-lock.json", "utf8");

  assert.equal(
    packageJson.dependencies["copilot-sdk-proxy"],
    "file:vendor/copilot-sdk-proxy",
  );
  assert.doesNotMatch(packageLock, /upstream-copilot-sdk-proxy/);
  await access("vendor/copilot-sdk-proxy/LICENSE");
  await access("vendor/copilot-sdk-proxy/src/providers/codex/tool-bridge.ts");
  await access("docs/MASTER_PRD.md");
});

test("pins the Desktop adapter to the reviewed Server contract", async () => {
  const baseline = JSON.parse(
    await readFile("docs/protocol/SERVER_CONTRACT_BASELINE.json", "utf8"),
  );

  assert.equal(CLOUD_CONTRACT_VERSION, "2.2.0");
  assert.equal(baseline.contractVersion, CLOUD_CONTRACT_VERSION);
  assert.equal(baseline.contractTag, "api-v2.2.0");
  assert.match(baseline.openApiSha256, /^[a-f0-9]{64}$/);
  assert.equal(baseline.billingMode, "SHADOW");
});

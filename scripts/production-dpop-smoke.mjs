import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DeviceIdentityStore } from "../dist-electron/cloud/device-identity.js";
import { DeviceKeyStore } from "../dist-electron/cloud/device-proof.js";
import { HttpCloudClient } from "../dist-electron/cloud/http-cloud-client.js";
import {
  cloudCredentialTarget,
  cloudDeviceKeyTarget,
  CloudTokenSession,
  WindowsCredentialManagerTokenStore,
} from "../dist-electron/cloud/token-store.js";
import { WindowsPasswordVaultCredentialManager } from "../dist-electron/cloud/windows-credential-manager.js";

const baseUrl = process.env.COPILOT_BRIDGE_CLOUD_BASE_URL;
const userData = process.env.COPILOT_BRIDGE_V2_USER_DATA;
if (baseUrl !== "https://ai.mddxz.top" || !userData) {
  throw new Error("Production origin and isolated test device path are required.");
}
const vault = new WindowsPasswordVaultCredentialManager();
const devices = new DeviceIdentityStore(join(userData, "cloud-device.json"), "0.2.0");
const tokens = new CloudTokenSession(new WindowsCredentialManagerTokenStore(vault, cloudCredentialTarget(baseUrl, userData)));
const client = new HttpCloudClient({
  baseUrl, devices, tokens,
  deviceKeys: new DeviceKeyStore(vault, cloudDeviceKeyTarget(baseUrl, userData)),
});

await client.refresh();
const before = await client.getWallet();
const threadId = randomUUID();
const model = "mock/mock-chat";
const first = await client.createResponse({
  model, input: "Use the read_file tool.", stream: false,
  tools: [{ type: "function", name: "read_file", parameters: {} }],
}, { threadId });
const firstResponse = await first.response.json();
const call = firstResponse.output?.find(item => item.type === "function_call");
assert.ok(call?.call_id, "The gated test provider must issue one tool call.");
assert.equal(firstResponse.usage?.billing_mode, "SHADOW");
assert.equal(firstResponse.usage?.points_charged, 0);

const continued = await client.createResponse({
  model, input: [{ type: "function_call_output", call_id: call.call_id, output: "SIGNED-LOW-CAP-OK" }],
  stream: false,
}, { threadId });
const final = await continued.response.json();
assert.equal(final.status, "completed");
assert.match(JSON.stringify(final.output), /SIGNED-LOW-CAP-OK/);
assert.equal(final.usage?.points_charged, 0);

await assert.rejects(
  client.createResponse({ model, input: "A second new turn must be rate-limited.", stream: false },
    { threadId: randomUUID() }),
  error => error?.code === "RATE_LIMITED",
);
const after = await client.getWallet();
assert.equal(after.balance, before.balance);
console.log(JSON.stringify({ result: "PASS", signedToolContinuation: true, newTurnRateLimited: true,
  billingMode: "SHADOW", pointsCharged: 0, walletUnchanged: true }));

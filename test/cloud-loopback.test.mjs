import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DeviceKeyStore } from "../dist-electron/cloud/device-proof.js";
import { HttpCloudClient } from "../dist-electron/cloud/http-cloud-client.js";
import { CloudTokenSession, WindowsCredentialManagerTokenStore } from "../dist-electron/cloud/token-store.js";

const baseUrl = process.env.COPILOT_BRIDGE_SIGNED_MOCK_URL;
const email = process.env.COPILOT_BRIDGE_SIGNED_MOCK_EMAIL;
const password = process.env.COPILOT_BRIDGE_SIGNED_MOCK_PASSWORD;
const model = process.env.COPILOT_BRIDGE_SIGNED_MOCK_MODEL ?? "mock/mock-chat";

test("signed Cloud client interoperates with the loopback mock", async () => {
  if (!baseUrl || !email || !password) {
    throw new Error("Set COPILOT_BRIDGE_SIGNED_MOCK_URL, _EMAIL and _PASSWORD to run signed loopback integration.");
  }
  const destination = new URL(baseUrl);
  assert.ok(["127.0.0.1", "localhost", "::1", "[::1]"].includes(destination.hostname));
  const vault = new Map();
  const credentials = {
    async read(target) { return vault.get(target) ?? null; },
    async write(target, value) { vault.set(target, value); },
    async delete(target) { vault.delete(target); },
  };
  const device = {
    deviceId: randomUUID(),
    deviceName: "loopback-proof-test",
    platform: "win32",
    osVersion: "test",
    appVersion: "0.1.0-test",
  };
  const tokens = new CloudTokenSession(
    new WindowsCredentialManagerTokenStore(credentials, "loopback-refresh"),
  );
  const captured = [];
  const captureFetch = async (input, init) => {
    const request = {
      url: String(input),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body ?? undefined,
    };
    captured.push(request);
    return fetch(input, init);
  };
  const client = new HttpCloudClient({
    baseUrl,
    tokens,
    devices: { async get() { return device; } },
    deviceKeys: new DeviceKeyStore(credentials, "loopback-device-key"),
    fetch: captureFetch,
  });

  await client.login({ email, password, device });
  assert.ok(tokens.getAccessToken());
  assert.ok(vault.get("loopback-device-key")?.includes("PRIVATE KEY"));
  const registered = await client.registerDevice(device);
  assert.equal(registered.deviceId, device.deviceId);
  const registration = captured.find((request) => request.url.endsWith("/api/v1/devices/register"));
  assert.ok(registration);
  assert.deepEqual(
    JSON.parse(registration.body).publicKeyJwk,
    (await new DeviceKeyStore(credentials, "loopback-device-key").get()).publicKeyJwk,
  );
  assert.equal((await client.getMe()).email, email);
  const authenticated = captured.find((request) => request.url.endsWith("/api/v1/auth/me"));
  assert.ok(authenticated);
  const raw = async (request, headers = request.headers) => fetch(request.url, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });
  const stolen = new Headers(authenticated.headers);
  stolen.delete("DPoP");
  assert.ok((await raw(authenticated, stolen)).status >= 400, "stolen token without proof must be rejected");
  assert.ok((await raw(authenticated)).status >= 400, "replayed signed request must be rejected");

  const threadId = randomUUID();
  const stream = await client.createResponse(
    { model, input: "Use the read_file tool and then summarize the output.", stream: true,
      tools: [{ type: "function", name: "read_file", description: "Read test marker.",
        parameters: { type: "object", properties: {} } }] },
    { threadId },
  );
  assert.match(stream.contentType, /text\/event-stream/);
  const events = parseSse(await stream.response.text());
  assert.ok(events.length > 0);
  const call = events.map((event) => event.item)
    .find((item) => item?.type === "function_call");
  assert.ok(call?.call_id, "mock should issue a tool call for continuation");
  const continuation = await client.createResponse({
    model,
    input: [{ type: "function_call_output", call_id: call.call_id, output: "LOOPBACK-DEVICE-PROOF-OK" }],
    stream: true,
  }, { threadId });
  assert.match(continuation.contentType, /text\/event-stream/);
  const continuedEvents = parseSse(await continuation.response.text());
  const completed = continuedEvents.find((event) => event.eventName === "response.completed");
  assert.ok(completed, "tool continuation must complete");
  assert.match(JSON.stringify(completed.response.output), /LOOPBACK-DEVICE-PROOF-OK/);

  const prior = await tokens.readRefreshToken();
  await client.refresh();
  assert.notEqual(await tokens.readRefreshToken(), prior);
  assert.equal((await client.getMe()).email, email);
  const refresh = captured.find((request) => request.url.endsWith("/api/v1/auth/refresh"));
  assert.ok(refresh);
  assert.ok((await raw(refresh)).status >= 400, "replayed refresh proof must be rejected");
});

function parseSse(text) {
  return text.split(/\r?\n\r?\n/).flatMap((frame) => {
    const line = frame.split(/\r?\n/).find((part) => part.startsWith("data: "));
    if (!line || line === "data: [DONE]") return [];
    const eventName = /^event:\s*(.+)$/m.exec(frame)?.[1];
    return [{ ...JSON.parse(line.slice(6)), eventName }];
  });
}

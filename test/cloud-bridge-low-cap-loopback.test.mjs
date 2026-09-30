import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DeviceKeyStore } from "../dist-electron/cloud/device-proof.js";
import { HttpCloudClient } from "../dist-electron/cloud/http-cloud-client.js";
import { RemoteBridgeServer } from "../dist-electron/cloud/remote-bridge-server.js";
import { CloudTokenSession, WindowsCredentialManagerTokenStore } from "../dist-electron/cloud/token-store.js";

test("signed RemoteBridgeServer tool continuation reuses a low-cap Mock request", async () => {
  const baseUrl = process.env.COPILOT_BRIDGE_LOW_CAP_MOCK_URL;
  const email = process.env.COPILOT_BRIDGE_LOW_CAP_MOCK_EMAIL;
  const password = process.env.COPILOT_BRIDGE_LOW_CAP_MOCK_PASSWORD;
  if (!baseUrl || !email || !password) {
    throw new Error("Set COPILOT_BRIDGE_LOW_CAP_MOCK_URL, _EMAIL and _PASSWORD for the account2/device1 signed Mock with a 1/min request cap.");
  }
  const destination = new URL(baseUrl);
  assert.equal(destination.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(destination.hostname));

  const vault = new Map();
  const credentials = {
    async read(target) { return vault.get(target) ?? null; },
    async write(target, secret) { vault.set(target, secret); },
    async delete(target) { vault.delete(target); },
  };
  const device = {
    deviceId: process.env.COPILOT_BRIDGE_LOW_CAP_MOCK_DEVICE_ID ?? randomUUID(),
    deviceName: "low-cap-loopback-device1",
    platform: "win32",
    osVersion: "test",
    appVersion: "0.1.0-test",
  };
  const tokens = new CloudTokenSession(
    new WindowsCredentialManagerTokenStore(credentials, "low-cap-refresh"),
  );
  const cloudRequests = [];
  const client = new HttpCloudClient({
    baseUrl,
    tokens,
    devices: { async get() { return device; } },
    deviceKeys: new DeviceKeyStore(credentials, "low-cap-device-key"),
    fetch: (url, init) => {
      if (new URL(String(url)).pathname === "/v1/responses") {
        cloudRequests.push({
          input: JSON.parse(init.body).input,
          threadId: new Headers(init.headers).get("X-Client-Thread-ID"),
        });
      }
      return fetch(url, init);
    },
  });
  const bridge = new RemoteBridgeServer(client, 0);
  const parallelTools = process.env.COPILOT_BRIDGE_LOW_CAP_MOCK_PARALLEL_TOOLS === "1";
  try {
    const login = await client.login({ email, password, device });
    assert.equal(login.user.email, email);
    assert.equal((await client.registerDevice(device)).deviceId, device.deviceId);
    const status = await bridge.start();
    assert.equal(status.state, "ready", status.message);
    const post = (input, stream = true, tools) => fetch(`${status.endpoint}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.COPILOT_BRIDGE_LOW_CAP_MOCK_MODEL ?? "mock/mock-chat",
        input,
        stream,
        ...(tools && { tools }),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const prompt = parallelTools
      ? process.env.COPILOT_BRIDGE_LOW_CAP_MOCK_PARALLEL_PROMPT
        ?? "Call read_file and edit_file in parallel, then summarize both outputs."
      : "Use the read_file tool, then summarize its output.";
    const tools = [{
      type: "function",
      name: "read_file",
      description: "Read the test marker.",
      parameters: { type: "object", properties: {} },
    }, ...(parallelTools ? [{
      type: "function",
      name: "edit_file",
      description: "Read the second test marker.",
      parameters: { type: "object", properties: {} },
    }] : [])];
    const initial = await post(prompt, true, tools);
    if (!initial.ok) assert.fail(`initial stream HTTP ${initial.status}: ${(await initial.text()).slice(0, 300)}`);
    assert.match(initial.headers.get("content-type") ?? "", /text\/event-stream/);
    const initialEvents = parseSse(await initial.text());
    const rawCalls = initialEvents.flatMap((event) =>
      event.name === "response.output_item.done" && event.data.item?.type === "function_call"
        ? [event.data.item]
        : event.name === "response.completed"
          ? (event.data.response?.output ?? []).filter((item) => item.type === "function_call")
          : []
    );
    const calls = [...new Map(rawCalls.map((item) => [item.call_id, {
      type: item.type, call_id: item.call_id, name: item.name, arguments: item.arguments,
    }])).values()];
    assert.equal(calls.length, parallelTools ? 2 : 1, "Mock must emit the requested tool calls");

    const marker = "LOW-CAP-TOOL-OK";
    if (parallelTools) {
      const partial = await post([
        { type: "function_call_output", call_id: calls[0].call_id, output: marker },
      ]);
      assert.equal(partial.status, 200);
      const partialEvents = parseSse(await partial.text());
      const acknowledged = partialEvents.find((event) => event.name === "response.completed")?.data.response;
      assert.deepEqual(acknowledged?.output, []);
      assert.deepEqual(acknowledged?.usage, {
        input_tokens: 0, output_tokens: 0, total_tokens: 0,
      });
      assert.equal(cloudRequests.length, 1, "first result must not use a second backend request");
    }
    const finalOutput = parallelTools ? "LOW-CAP-TOOL-SECOND-OK" : marker;
    const continued = await post([
      ...(parallelTools ? [{
        type: "function_call_output", call_id: calls[0].call_id, output: marker,
      }] : []),
      { type: "function_call_output", call_id: calls.at(-1).call_id, output: finalOutput },
    ]);
    if (!continued.ok) assert.fail(`continuation HTTP ${continued.status}: ${(await continued.text()).slice(0, 300)}; inputs: ${JSON.stringify(cloudRequests)}`);
    const events = parseSse(await continued.text());
    const completed = events.find((event) => event.name === "response.completed");
    assert.ok(completed, "continuation must complete");
    assert.match(JSON.stringify(completed.data.response.output), new RegExp(finalOutput));
    assert.equal(cloudRequests.length, 2);
    assert.equal(cloudRequests[0].threadId, cloudRequests[1].threadId);
    assert.equal(cloudRequests[1].input.length, parallelTools ? 5 : 3,
      "history must contain one copy of each function call and its output");
    assert.deepEqual(cloudRequests[1].input, [
      { role: "user", content: prompt },
      ...calls,
      ...(parallelTools ? [{
        type: "function_call_output", call_id: calls[0].call_id, output: marker,
      }] : []),
      { type: "function_call_output", call_id: calls.at(-1).call_id, output: finalOutput },
    ]);

    const newPrompt = await post("A new, unrelated request must be rate-limited.", false);
    assert.equal(newPrompt.status, 429, "new prompt must exhaust the 1/min cap");
    assert.equal((await newPrompt.json()).error.code, "RATE_LIMITED");
    assert.equal(cloudRequests.length, 3);
  } finally {
    await bridge.stop();
  }
});

function parseSse(text) {
  return text.split(/\r?\n\r?\n/).flatMap((frame) => {
    const line = frame.split(/\r?\n/).find((part) => part.startsWith("data: "));
    if (!line || line === "data: [DONE]") return [];
    return [{ name: /^event:\s*(.+)$/m.exec(frame)?.[1], data: JSON.parse(line.slice(6)) }];
  });
}

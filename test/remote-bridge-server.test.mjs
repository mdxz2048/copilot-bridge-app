import assert from "node:assert/strict";
import test from "node:test";
import { MockCloudClient } from "../dist-electron/cloud/mock-cloud-client.js";
import { RemoteBridgeServer } from "../dist-electron/cloud/remote-bridge-server.js";

const responsePayload = {
  id: "resp_0123456789abcdef0123456789abcdef",
  object: "response",
  status: "completed",
  model: "mock/mock-chat",
  output: [{
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "done" }],
  }],
  usage: {
    input_tokens: 1,
    output_tokens: 1,
    total_tokens: 2,
    request_id: "11111111-1111-4111-8111-111111111111",
  },
};

test("notifies settlement after a JSON response completes", async () => {
  const notifications = [];
  const client = new MockCloudClient()
    .respond("getMe", {
      id: "22222222-2222-4222-8222-222222222222",
      email: "desktop@example.test",
      role: "USER",
      status: "ACTIVE",
    })
    .respond("createResponse", {
      contentType: "application/json",
      response: Response.json(responsePayload),
    });
  const bridge = new RemoteBridgeServer(
    client,
    0,
    undefined,
    undefined,
    (target) => notifications.push(target),
  );
  try {
    const status = await bridge.start();
    const response = await fetch(`${status.endpoint}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mock/mock-chat",
        input: "hello",
        stream: false,
      }),
    });
    assert.equal(response.status, 200);
    await response.json();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(notifications, [{
      responseId: responsePayload.id,
      requestId: responsePayload.usage.request_id,
      recovery: false,
    }]);
  } finally {
    await bridge.stop();
  }
});

test("requests settlement recovery when SSE ends without completion", async () => {
  const notifications = [];
  const stream = [
    "event: response.created",
    `data: ${JSON.stringify({
      type: "response.created",
      response: { id: responsePayload.id },
    })}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  const client = new MockCloudClient()
    .respond("getMe", {
      id: "22222222-2222-4222-8222-222222222222",
      email: "desktop@example.test",
      role: "USER",
      status: "ACTIVE",
    })
    .respond("createResponse", {
      contentType: "text/event-stream",
      response: new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "X-Bridge-AI-Request-Id": responsePayload.usage.request_id,
        },
      }),
    });
  const bridge = new RemoteBridgeServer(
    client,
    0,
    undefined,
    undefined,
    (target) => notifications.push(target),
  );
  try {
    const status = await bridge.start();
    const response = await fetch(`${status.endpoint}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mock/mock-chat",
        input: "hello",
        stream: true,
      }),
    });
    assert.equal(response.status, 200);
    await response.text();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(notifications, [{
      responseId: responsePayload.id,
      requestId: responsePayload.usage.request_id,
      recovery: true,
    }]);
  } finally {
    await bridge.stop();
  }
});

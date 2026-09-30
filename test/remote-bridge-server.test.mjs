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

test("SSE done and completed capture a call once without stealing another conversation's call ID", async () => {
  const call = {
    type: "function_call",
    call_id: "call_1",
    name: "read_file",
    arguments: "{}",
  };
  const otherCall = { ...call, call_id: "call_2", name: "edit_file" };
  const toolResponse = { ...responsePayload, output: [call, otherCall] };
  const stream = [
    "event: response.output_item.done",
    `data: ${JSON.stringify({ type: "response.output_item.done", item: call })}`,
    "",
    "event: response.output_item.done",
    `data: ${JSON.stringify({ type: "response.output_item.done", item: otherCall })}`,
    "",
    "event: response.completed",
    `data: ${JSON.stringify({ type: "response.completed", response: toolResponse })}`,
    "",
  ].join("\n");
  const requests = [];
  const notifications = [];
  const client = new MockCloudClient().respond("getMe", {
    id: "22222222-2222-4222-8222-222222222222",
    email: "desktop@example.test",
    role: "USER",
    status: "ACTIVE",
  });
  client.createResponse = async (request, options) => {
    requests.push({ request: structuredClone(request), options });
    if (requests.length === 1) {
      return {
        contentType: "text/event-stream",
        response: new Response(stream, { headers: { "content-type": "text/event-stream" } }),
      };
    }
    return {
      contentType: "application/json",
      response: Response.json(requests.length === 2 ? toolResponse : responsePayload),
    };
  };
  const bridge = new RemoteBridgeServer(client, 0, undefined, undefined,
    (target) => notifications.push(target));
  try {
    const status = await bridge.start();
    assert.equal(status.state, "ready");
    const post = (input, streamResponse = false) => fetch(`${status.endpoint}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mock/mock-chat",
        input,
        stream: streamResponse,
        ...(streamResponse && { tools: [{ type: "function", name: "read_file" }] }),
      }),
    });
    const first = await post("original prompt", true);
    assert.equal(first.status, 200);
    await first.text();
    const collision = await post("independent prompt");
    assert.equal(collision.status, 502);
    assert.equal((await collision.json()).error.code, "INVALID_SERVER_RESPONSE");
    assert.notEqual(requests[0].options.threadId, requests[1].options.threadId);

    const continuation = await post([
      { type: "function_call_output", call_id: call.call_id, output: "marker" },
    ]);
    assert.equal(continuation.status, 200);
    const acknowledgment = await continuation.json();
    assert.deepEqual(acknowledgment.output, []);
    assert.deepEqual(acknowledgment.usage, {
      input_tokens: 0, output_tokens: 0, total_tokens: 0,
    });
    assert.equal(requests.length, 2, "partial tool outputs must not reach Cloud");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(notifications.length, 1, "local acknowledgment must not report settlement");

    const previousOutput = {
      type: "function_call_output", call_id: call.call_id, output: "marker",
    };
    const nextOutput = {
      type: "function_call_output", call_id: otherCall.call_id, output: "second marker",
    };
    for (const invalid of [
      [{ ...previousOutput, output: "tampered" }, nextOutput],
      [previousOutput, previousOutput, nextOutput],
      [{ ...previousOutput, call_id: "another-thread" }, nextOutput],
    ]) {
      const rejected = await post(invalid);
      assert.equal(rejected.status, 400);
      assert.equal((await rejected.json()).error.code, "VALIDATION_ERROR");
      assert.equal(requests.length, 2, "invalid history must not reach Cloud");
    }
    const otherContinuation = await post([
      previousOutput, nextOutput,
    ]);
    assert.equal(otherContinuation.status, 200);
    await otherContinuation.json();
    assert.equal(requests.length, 3);
    assert.equal(requests[2].options.threadId, requests[0].options.threadId);
    assert.deepEqual(requests[2].request.input, [
      { role: "user", content: "original prompt" },
      call,
      otherCall,
      previousOutput,
      nextOutput,
    ]);
  } finally {
    await bridge.stop();
  }
});

test("streaming partial tool output completes locally without Cloud usage or settlement", async () => {
  const calls = ["call_a", "call_b"].map((call_id) => ({
    type: "function_call", call_id, name: "read_file", arguments: "{}",
  }));
  const initialResponse = { ...responsePayload, output: calls };
  const requested = [];
  const settlements = [];
  const client = new MockCloudClient().respond("getMe", {
    id: "22222222-2222-4222-8222-222222222222",
    email: "desktop@example.test", role: "USER", status: "ACTIVE",
  });
  client.createResponse = async (request) => {
    requested.push(structuredClone(request));
    if (requested.length === 1) {
      return { contentType: "application/json", response: Response.json(initialResponse) };
    }
    return {
      contentType: "text/event-stream",
      response: new Response(
        `event: response.completed\ndata: ${JSON.stringify({ response: responsePayload })}\n\ndata: [DONE]\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      ),
    };
  };
  const bridge = new RemoteBridgeServer(client, 0, undefined, undefined,
    (target) => settlements.push(target));
  try {
    const status = await bridge.start();
    const post = (input, stream) => fetch(`${status.endpoint}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "mock/mock-chat", input, stream }),
    });
    const initial = await post("hello", false);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).output.length, 2);
    const partial = await post([
      { type: "function_call_output", call_id: "call_a", output: "first" },
    ], true);
    assert.equal(partial.status, 200);
    assert.match(partial.headers.get("content-type") ?? "", /text\/event-stream/);
    const text = await partial.text();
    const completed = JSON.parse(/^data: (.+)$/m.exec(text.split("event: response.completed")[1])?.[1]);
    assert.equal(completed.response.status, "completed");
    assert.deepEqual(completed.response.output, []);
    assert.deepEqual(completed.response.usage, {
      input_tokens: 0, output_tokens: 0, total_tokens: 0,
    });
    assert.match(text, /data: \[DONE\]/);
    assert.equal(requested.length, 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settlements.length, 1);

    const final = await post([
      { type: "function_call_output", call_id: "call_b", output: "second" },
    ], true);
    assert.equal(final.status, 200);
    assert.match(await final.text(), /response.completed/);
    assert.equal(requested.length, 2);
    assert.deepEqual(requested[1].input, [
      { role: "user", content: "hello" },
      ...calls,
      { type: "function_call_output", call_id: "call_a", output: "first" },
      { type: "function_call_output", call_id: "call_b", output: "second" },
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settlements.length, 2);
  } finally {
    await bridge.stop();
  }
});

test("cumulative history from another active conversation cannot satisfy a pending call", async () => {
  const calls = (prefix) => ["1", "2"].map((suffix) => ({
    type: "function_call", call_id: `${prefix}${suffix}`,
    name: "read_file", arguments: "{}",
  }));
  const received = [];
  const client = new MockCloudClient().respond("getMe", {
    id: "22222222-2222-4222-8222-222222222222",
    email: "desktop@example.test", role: "USER", status: "ACTIVE",
  });
  client.createResponse = async (request, options) => {
    received.push({ request: structuredClone(request), threadId: options.threadId });
    return {
      contentType: "application/json",
      response: Response.json({
        ...responsePayload,
        output: received.length === 1 ? calls("a")
          : received.length === 2 ? calls("b") : responsePayload.output,
      }),
    };
  };
  const bridge = new RemoteBridgeServer(client, 0);
  try {
    const { endpoint } = await bridge.start();
    const post = (input) => fetch(`${endpoint}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "mock/mock-chat", input }),
    });
    for (const prompt of ["first", "second"]) {
      const response = await post(prompt);
      assert.equal(response.status, 200);
      await response.json();
    }
    assert.notEqual(received[0].threadId, received[1].threadId);
    const a1 = { type: "function_call_output", call_id: "a1", output: "first" };
    const a2 = { type: "function_call_output", call_id: "a2", output: "second" };
    const b1 = { type: "function_call_output", call_id: "b1", output: "other" };
    for (const partial of [a1, b1]) {
      const response = await post([partial]);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).output, []);
    }
    assert.equal(received.length, 2);
    const mixed = await post([b1, a2]);
    assert.equal(mixed.status, 400);
    assert.equal((await mixed.json()).error.code, "VALIDATION_ERROR");
    assert.equal(received.length, 2);

    const final = await post([a1, a2]);
    assert.equal(final.status, 200);
    await final.json();
    assert.equal(received[2].threadId, received[0].threadId);
    assert.deepEqual(received[2].request.input.slice(-2), [a1, a2]);
    const otherFinal = await post([b1, {
      type: "function_call_output", call_id: "b2", output: "other second",
    }]);
    assert.equal(otherFinal.status, 200);
    await otherFinal.json();
    assert.equal(received[3].threadId, received[1].threadId);
  } finally {
    await bridge.stop();
  }
});

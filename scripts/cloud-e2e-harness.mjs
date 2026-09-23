import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CloudFoundation } from "../dist-electron/cloud/cloud-foundation.js";
import { HttpCloudClient } from "../dist-electron/cloud/http-cloud-client.js";
import { DeviceIdentityStore } from "../dist-electron/cloud/device-identity.js";
import { RemoteBridgeServer } from "../dist-electron/cloud/remote-bridge-server.js";
import {
  CloudTokenSession,
  WindowsCredentialManagerTokenStore,
} from "../dist-electron/cloud/token-store.js";
import {
  WindowsPasswordVaultCredentialManager,
} from "../dist-electron/cloud/windows-credential-manager.js";

const baseUrl = requiredEnvironment("COPILOT_BRIDGE_CLOUD_BASE_URL");
const email = requiredEnvironment("COPILOT_BRIDGE_E2E_EMAIL");
const password = requiredEnvironment("COPILOT_BRIDGE_E2E_PASSWORD");
const e2eMode = process.env.COPILOT_BRIDGE_E2E_ENVIRONMENT ?? "TEST";
if (e2eMode !== "TEST" && e2eMode !== "PRODUCTION") {
  throw new Error(`Invalid Cloud E2E environment: ${e2eMode}`);
}
const requestTimeoutMs = e2eMode === "PRODUCTION" ? 30_000 : 5_000;
const root = await mkdtemp(resolve(tmpdir(), "copilot-cloud-e2e-"));
const fixture = resolve(root, "cloud-tool.txt");
const editFixture = resolve(root, "cloud-edit.txt");
const credentialTarget = `CopilotBridge.Cloud.E2E.${randomUUID()}`;
const credentials = new WindowsPasswordVaultCredentialManager();
const tokenStore = new WindowsCredentialManagerTokenStore(
  credentials,
  credentialTarget,
);
const tokenSession = new CloudTokenSession(tokenStore);
const devicePath = process.env.COPILOT_BRIDGE_E2E_DEVICE_PATH
  ?? join(
    process.env.LOCALAPPDATA ?? tmpdir(),
    "CopilotBridgeCloudE2E",
    "device.json",
  );
const deviceStore = new DeviceIdentityStore(devicePath, "0.1.0-e2e");
const client = new HttpCloudClient({
  baseUrl,
  tokens: tokenSession,
  devices: deviceStore,
  timeoutMs: requestTimeoutMs,
});
const configuration = {
  async get() {
    return {
      contractStatus: "READY",
      runtimeMode: e2eMode,
      gatewayBaseUrl: baseUrl,
      accountManagementUrl: e2eMode === "PRODUCTION"
        ? "https://ai.mddxz.top/dashboard"
        : null,
      subscriptionManagementUrl: e2eMode === "PRODUCTION"
        ? "https://ai.mddxz.top/dashboard/subscription"
        : null,
    };
  },
};
const foundation = new CloudFoundation(client, configuration, deviceStore);
const bridge = new RemoteBridgeServer(client, 0);
const results = {};
const evidence = {};

try {
  await writeFile(
    fixture,
    "Cloud local read acceptance marker: CLOUD-TOOL-731\n",
    "utf8",
  );
  await writeFile(editFixture, "before\n", "utf8");

  const initialDevice = await deviceStore.get();
  const restartedDevice = await new DeviceIdentityStore(
    devicePath,
    "0.1.0-e2e",
  ).get();
  results.deviceStable = pass(initialDevice.deviceId === restartedDevice.deviceId);

  const loginStatus = await foundation.login({ email, password });
  const storedAfterLogin = await tokenStore.readRefreshToken();
  results.auth = pass(
    loginStatus.authState === "AUTHENTICATED"
      && tokenSession.getAccessToken() !== null
      && storedAfterLogin !== null,
  );

  const me = await client.getMe();
  const account = await client.getAccount();
  const registered = await client.registerDevice(initialDevice);
  const devices = await client.listDevices();
  const subscription = await client.getSubscription();
  const usageBefore = await client.getUsage();
  const clientConfig = await client.getClientConfig();
  const models = await client.listModels();
  const latestRelease = await client.getLatestRelease();
  results.device = pass(
    registered.deviceId === initialDevice.deviceId
      && devices.some((device) =>
        device.deviceId === initialDevice.deviceId
        && device.status === "ACTIVE"
      ),
  );
  results.account = pass(
    me.email === email
      && account.user.email === email
      && account.plan?.code === "PRO"
      && subscription.subscription?.status === "ACTIVE"
      && clientConfig.features.cloudGateway,
  );
  results.models = pass(
    models.data.some((model) =>
      model.id === "mock/mock-chat"
      && model.capabilities.tools
      && model.capabilities.streaming
    ),
  );
  results.release = pass(
    latestRelease.release === null
      || (
        latestRelease.release.platform === "windows"
        && latestRelease.release.published
      ),
  );

  const refreshBefore = await tokenStore.readRefreshToken();
  await tokenSession.rotate({
    accessToken: "expired-access-token-for-real-refresh",
    refreshToken: refreshBefore,
  });
  await client.getAccount();
  const refreshAfter = await tokenStore.readRefreshToken();
  results.refreshRotation = pass(
    refreshBefore !== null
      && refreshAfter !== null
      && refreshAfter !== refreshBefore,
  );

  const textTransport = await client.createResponse(
    { model: "mock/mock-chat", input: "Cloud Desktop text E2E", stream: false },
    { threadId: randomUUID() },
  );
  const textResponse = await textTransport.response.json();
  const text = responseText(textResponse);
  results.text = pass(
    textResponse.status === "completed"
      && text.includes("Mock response: Cloud Desktop text E2E"),
  );

  const streamTransport = await client.createResponse(
    { model: "mock/mock-chat", input: "Cloud Desktop SSE E2E", stream: true },
    { threadId: randomUUID() },
  );
  const stream = await readSse(streamTransport.response);
  results.sse = pass(
    stream.eventNames.includes("response.created")
      && stream.eventNames.includes("response.output_text.delta")
      && stream.eventNames.includes("response.completed")
      && stream.done,
  );

  const bridgeStatus = await bridge.start();
  if (bridgeStatus.state !== "ready") {
    throw new Error(bridgeStatus.message);
  }
  const tools = [
    {
      type: "function",
      name: "read_file",
      description: "Read the authorized Cloud E2E fixture.",
      parameters: { type: "object", properties: {} },
    },
    {
      type: "function",
      name: "edit_file",
      description: "Edit the authorized Cloud E2E fixture.",
      parameters: { type: "object", properties: {} },
    },
    {
      type: "function",
      name: "run_shell",
      description: "Run the authorized Cloud E2E shell probe.",
      parameters: { type: "object", properties: {} },
    },
  ];
  const prompt =
    "Use each declared local tool in order. The read marker is only inside the fixture and is not present in this prompt.";
  if (prompt.includes("CLOUD-TOOL-731")) throw new Error("Tool marker leaked");

  const localOutputs = [];
  let localInput = prompt;
  let finalAnswer = "";
  for (let turn = 0; turn < 4; turn += 1) {
    const localResponse = await fetch(`${bridgeStatus.endpoint}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mock/mock-chat",
        input: localInput,
        stream: true,
        tools,
      }),
    });
    if (!localResponse.ok) {
      throw new Error(
        `Local Cloud tool turn ${String(turn)} failed: ${await localResponse.text()}`,
      );
    }
    const localStream = await readSse(localResponse);
    const call = localStream.functionCalls.at(-1);
    if (!call) {
      finalAnswer = localStream.finalText;
      break;
    }
    const output = await executeLocalTool(call.name);
    localOutputs.push({ name: call.name, output });
    localInput = [{
      type: "function_call_output",
      call_id: call.call_id,
      output,
    }];
  }
  const edited = await readFile(editFixture, "utf8");
  results.localRead = pass(
    localOutputs.some((item) =>
      item.name === "read_file" && item.output.includes("CLOUD-TOOL-731")
    ),
  );
  results.localEdit = pass(
    localOutputs.some((item) => item.name === "edit_file")
      && edited.includes("CLOUD-EDIT-482"),
  );
  results.localShell = pass(
    localOutputs.some((item) =>
      item.name === "run_shell" && item.output.includes("CLOUD-SHELL-913")
    ),
  );
  results.functionCallOutput = pass(
    finalAnswer.includes("CLOUD-TOOL-731")
      && finalAnswer.includes("CLOUD-EDIT-482")
      && finalAnswer.includes("CLOUD-SHELL-913"),
  );
  results.sameSession = pass(
    localOutputs.length === 3
      && localOutputs.map((item) => item.name).join(",")
        === "read_file,edit_file,run_shell",
  );
  results.finalMarker = pass(finalAnswer.includes("CLOUD-TOOL-731"));

  const usageAfter = await client.getUsage();
  results.usage = pass(
    usageAfter.requests > usageBefore.requests
      && usageAfter.tokens > usageBefore.tokens,
  );
  evidence.usage = {
    before: {
      requests: usageBefore.requests,
      tokens: usageBefore.tokens,
    },
    after: {
      requests: usageAfter.requests,
      tokens: usageAfter.tokens,
    },
  };

  const timeoutClient = new HttpCloudClient({
    baseUrl,
    tokens: tokenSession,
    devices: deviceStore,
    timeoutMs: 5,
  });
  let timeoutObserved = false;
  try {
    const timedTransport = await timeoutClient.createResponse(
      { model: "mock/mock-chat", input: "timeout", stream: true },
      { threadId: randomUUID() },
    );
    await timedTransport.response.text();
  } catch (error) {
    timeoutObserved = error instanceof Error
      && (
        error.name === "TimeoutError"
        || error.name === "AbortError"
        || ("code" in error && error.code === "SERVER_UNREACHABLE")
      );
  }
  results.timeout = pass(timeoutObserved);

  const disconnect = new AbortController();
  disconnect.abort();
  let disconnectCode = null;
  try {
    await client.createResponse(
      { model: "mock/mock-chat", input: "disconnect", stream: true },
      { threadId: randomUUID(), signal: disconnect.signal },
    );
  } catch (error) {
    disconnectCode = error && typeof error === "object" && "code" in error
      ? error.code
      : null;
  }
  results.disconnect = pass(disconnectCode === "SERVER_UNREACHABLE");

  await bridge.stop();
  const logoutRefreshToken = await tokenStore.readRefreshToken();
  await tokenSession.rotate({
    accessToken: "expired-access-token-for-real-logout-refresh",
    refreshToken: logoutRefreshToken,
  });
  await client.logout();
  results.logoutRotation = pass(
    tokenSession.getAccessToken() === null
      && await tokenStore.readRefreshToken() === null,
  );
  await foundation.login({ email, password });

  if (e2eMode === "TEST") {
    results.subscriptionExpired = await verifyControlledError(
      "SUBSCRIPTION_EXPIRED",
      "SUBSCRIPTION_EXPIRED",
    );
    results.quotaExceeded = await verifyControlledError(
      "MONTHLY_QUOTA_EXCEEDED",
      "QUOTA_EXCEEDED",
    );
  }
  if (e2eMode === "TEST") {
    results.deviceRevoked = await verifyRevokedDevice();
  }

  const unreachableClient = new HttpCloudClient({
    baseUrl: "http://127.0.0.1:1",
    tokens: tokenSession,
    devices: deviceStore,
    timeoutMs: 100,
  });
  let unreachableCode = null;
  try {
    await unreachableClient.getClientConfig();
  } catch (error) {
    unreachableCode = error && typeof error === "object" && "code" in error
      ? error.code
      : null;
  }
  results.serverUnreachable = pass(unreachableCode === "SERVER_UNREACHABLE");

  evidence.account = {
    email: account.user.email,
    plan: account.plan?.code,
    subscription: subscription.subscription?.status,
  };
  evidence.device = {
    stable: results.deviceStable.status,
    status: registered.status,
  };
  evidence.models = models.data.map((model) => model.id);
  evidence.release = {
    value: latestRelease.release === null
      ? null
      : {
          version: latestRelease.release.version,
          platform: latestRelease.release.platform,
        },
  };
  evidence.environment = e2eMode;
  evidence.mockOnlyControlsUsed = e2eMode === "TEST";
  evidence.toolCalls = localOutputs.map((item) => ({
    name: item.name,
    outputContainsExpectedMarker:
      item.output.includes("CLOUD-TOOL-731")
      || item.output.includes("CLOUD-EDIT-482")
      || item.output.includes("CLOUD-SHELL-913"),
  }));
  evidence.finalAnswer = finalAnswer;
} finally {
  await bridge.stop();
  await tokenStore.deleteRefreshToken();
  await rm(root, { recursive: true, force: true });
}

const requiredPasses = Object.values(results)
  .every((result) => result.status === "PASS");
console.log(JSON.stringify({
  result: requiredPasses ? "PASS" : "FAIL",
  results,
  evidence,
}, null, 2));
if (!requiredPasses) process.exitCode = 1;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function pass(condition) {
  return { status: condition ? "PASS" : "FAIL" };
}

function responseText(response) {
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("");
}

async function readSse(response) {
  const text = await response.text();
  const eventNames = [];
  const functionCalls = [];
  let finalText = "";
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (block.trim() === "data: [DONE]") continue;
    const event = /^event:\s*(.+)$/m.exec(block)?.[1];
    const data = /^data:\s*(.+)$/m.exec(block)?.[1];
    if (!event || !data) continue;
    eventNames.push(event);
    const payload = JSON.parse(data);
    if (event === "response.output_item.done" && payload.item?.type === "function_call") {
      functionCalls.push(payload.item);
    }
    if (event === "response.completed") {
      finalText = responseText(payload.response);
    }
  }
  return {
    eventNames,
    functionCalls,
    finalText,
    done: text.includes("data: [DONE]"),
  };
}

async function executeLocalTool(name) {
  if (name === "read_file") return readFile(fixture, "utf8");
  if (name === "edit_file") {
    await writeFile(editFixture, "after CLOUD-EDIT-482\n", "utf8");
    return JSON.stringify({ ok: true, marker: "CLOUD-EDIT-482" });
  }

  if (name === "run_shell") {
    const result = await runProcess(process.execPath, [
      "-e",
      "process.stdout.write('CLOUD-SHELL-913')",
    ]);
    if (result.exitCode !== 0) throw new Error(result.stderr);
    return result.stdout;
  }
  throw new Error(`Unexpected tool ${name}`);
}

async function verifyRevokedDevice() {
  const revokedTarget = `CopilotBridge.Cloud.E2E.Revoked.${randomUUID()}`;
  const revokedStore = new WindowsCredentialManagerTokenStore(
    credentials,
    revokedTarget,
  );
  const revokedTokens = new CloudTokenSession(revokedStore);
  const revokedDevices = new DeviceIdentityStore(
    resolve(root, "revoked-device.json"),
    "0.1.0-e2e",
  );
  const revokedClient = new HttpCloudClient({
    baseUrl,
    tokens: revokedTokens,
    devices: revokedDevices,
    timeoutMs: requestTimeoutMs,
  });
  const revokedFoundation = new CloudFoundation(
    revokedClient,
    configuration,
    revokedDevices,
  );
  try {
    await revokedFoundation.login({ email, password });
    const identity = await revokedDevices.get();
    const device = (await revokedClient.listDevices()).find(
      (item) => item.deviceId === identity.deviceId,
    );
    const accessToken = revokedTokens.getAccessToken();
    if (!device || !accessToken) {
      throw new Error("Revoked-device prerequisites are unavailable.");
    }
    const revoke = await fetch(
      `${baseUrl}/api/v1/devices/${device.id}`,
      {
        method: "DELETE",
        headers: { Authorization: ["Bearer", accessToken].join(" ") },
      },
    );
    if (!revoke.ok) throw new Error(await revoke.text());
    let revokedCode = null;
    try {
      await revokedFoundation.refresh();
    } catch (error) {
      revokedCode = error && typeof error === "object" && "code" in error
        ? error.code
        : null;
    }
    const status = await revokedFoundation.getStatus();
    return pass(
      revokedCode === "DEVICE_REVOKED"
        && status.authState === "DEVICE_REVOKED",
    );
  } finally {
    await revokedStore.deleteRefreshToken();
  }
}

async function verifyControlledError(wireCode, expectedState) {
  const controlledClient = new HttpCloudClient({
    baseUrl,
    tokens: tokenSession,
    devices: deviceStore,
    timeoutMs: requestTimeoutMs,
    defaultHeaders: { "X-Mock-Error-Code": wireCode },
  });
  const controlledFoundation = new CloudFoundation(
    controlledClient,
    configuration,
    deviceStore,
  );
  let actualCode = null;
  try {
    await controlledFoundation.refresh();
  } catch (error) {
    actualCode = error && typeof error === "object" && "code" in error
      ? error.code
      : null;
  }
  return pass(
    actualCode === wireCode
      && (await controlledFoundation.getStatus()).authState === expectedState,
  );
}

function runProcess(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolvePromise({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

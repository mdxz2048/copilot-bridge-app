import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CLOUD_AUTH_STATES,
  CloudAuthStateMachine,
} from "../dist-electron/cloud/auth-state.js";
import {
  CloudContractUnavailableError,
  PendingCloudClient,
} from "../dist-electron/cloud/cloud-client.js";
import {
  authStateForCloudError,
  CloudError,
} from "../dist-electron/cloud/cloud-error.js";
import {
  PendingCloudConfigurationProvider,
  PRODUCTION_ACCOUNT_MANAGEMENT_URL,
  PRODUCTION_CLOUD_BASE_URL,
  resolveCloudRuntimeConfiguration,
} from "../dist-electron/cloud/cloud-config.js";
import { CloudFoundation } from "../dist-electron/cloud/cloud-foundation.js";
import { DeviceIdentityStore } from "../dist-electron/cloud/device-identity.js";
import { MockCloudClient } from "../dist-electron/cloud/mock-cloud-client.js";
import { withSingleTokenRefreshRetry } from "../dist-electron/cloud/retry.js";
import {
  cloudCredentialTarget,
  CloudTokenSession,
  WindowsCredentialManagerTokenStore,
} from "../dist-electron/cloud/token-store.js";

test("defines every required Cloud auth state and enforces transitions", () => {
  assert.deepEqual(CLOUD_AUTH_STATES, [
    "SIGNED_OUT",
    "AUTHENTICATING",
    "AUTHENTICATED",
    "DEVICE_REVOKED",
    "SUBSCRIPTION_REQUIRED",
    "SUBSCRIPTION_EXPIRED",
    "QUOTA_EXCEEDED",
    "SERVER_UNREACHABLE",
  ]);

  const machine = new CloudAuthStateMachine();
  assert.equal(machine.transition("AUTHENTICATING"), "AUTHENTICATING");
  assert.equal(machine.transition("AUTHENTICATED"), "AUTHENTICATED");
  assert.equal(machine.transition("DEVICE_REVOKED"), "DEVICE_REVOKED");
  assert.throws(
    () => machine.transition("QUOTA_EXCEEDED"),
    /Invalid Cloud auth transition/,
  );
});

test("separates production, development override, and loopback test Cloud configuration", () => {
  const production = resolveCloudRuntimeConfiguration({
    isPackaged: true,
    environment: {},
  });
  assert.equal(production.runtimeMode, "PRODUCTION");
  assert.equal(production.gatewayBaseUrl, PRODUCTION_CLOUD_BASE_URL);
  assert.equal(
    production.accountManagementUrl,
    PRODUCTION_ACCOUNT_MANAGEMENT_URL,
  );
  assert.equal(
    production.subscriptionManagementUrl,
    "https://ai.mddxz.top/dashboard/subscription",
  );

  const development = resolveCloudRuntimeConfiguration({
    isPackaged: false,
    environment: {
      COPILOT_BRIDGE_CLOUD_BASE_URL: "http://127.0.0.1:3001/",
    },
  });
  assert.equal(development.runtimeMode, "DEVELOPMENT");
  assert.equal(development.gatewayBaseUrl, "http://127.0.0.1:3001");

  const testConfiguration = resolveCloudRuntimeConfiguration({
    isPackaged: false,
    environment: {
      COPILOT_BRIDGE_CLOUD_MODE: "TEST",
      COPILOT_BRIDGE_CLOUD_BASE_URL: "http://localhost:3001",
    },
  });
  assert.equal(testConfiguration.runtimeMode, "TEST");
  assert.equal(testConfiguration.accountManagementUrl, null);
  assert.equal(testConfiguration.subscriptionManagementUrl, null);

  assert.throws(
    () => resolveCloudRuntimeConfiguration({
      isPackaged: true,
      environment: {
        COPILOT_BRIDGE_CLOUD_MODE: "PRODUCTION",
        COPILOT_BRIDGE_CLOUD_BASE_URL: "http://127.0.0.1:3001",
      },
    }),
    /Production Cloud mode cannot use/,
  );
  assert.throws(
    () => resolveCloudRuntimeConfiguration({
      isPackaged: false,
      environment: {
        COPILOT_BRIDGE_CLOUD_MODE: "TEST",
        COPILOT_BRIDGE_CLOUD_BASE_URL: "https://ai.mddxz.top",
      },
    }),
    /loopback/,
  );
});

test("maps only stable Cloud errors to auth states", () => {
  assert.equal(
    authStateForCloudError(new CloudError("DEVICE_REVOKED", "revoked")),
    "DEVICE_REVOKED",
  );
  assert.equal(
    authStateForCloudError(
      new CloudError("SUBSCRIPTION_REQUIRED", "required"),
    ),
    "SUBSCRIPTION_REQUIRED",
  );
  assert.equal(
    authStateForCloudError(new CloudError("SUBSCRIPTION_EXPIRED", "expired")),
    "SUBSCRIPTION_EXPIRED",
  );
  assert.equal(
    authStateForCloudError(
      new CloudError("MONTHLY_QUOTA_EXCEEDED", "quota"),
    ),
    "QUOTA_EXCEEDED",
  );
  assert.equal(
    authStateForCloudError(new CloudError("UNMAPPED", "unknown")),
    null,
  );
});

test("retries TOKEN_EXPIRED once and never loops", async () => {
  let attempts = 0;
  let refreshes = 0;
  const result = await withSingleTokenRefreshRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new CloudError("TOKEN_EXPIRED", "expired");
      return "ok";
    },
    async () => {
      refreshes += 1;
    },
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.equal(refreshes, 1);

  attempts = 0;
  await assert.rejects(
    withSingleTokenRefreshRetry(
      async () => {
        attempts += 1;
        throw new CloudError("TOKEN_EXPIRED", "expired");
      },
      async () => {
        refreshes += 1;
      },
    ),
    (error) => error instanceof CloudError && error.code === "TOKEN_EXPIRED",
  );
  assert.equal(attempts, 2);
});

test("keeps access tokens in memory and rotates refresh tokens in credentials", async () => {
  const credentials = new MemoryCredentialManager();
  const store = new WindowsCredentialManagerTokenStore(credentials);
  const session = new CloudTokenSession(store);

  await session.rotate({
    accessToken: "short-lived-access",
    refreshToken: "rotated-refresh",
  });
  assert.equal(session.getAccessToken(), "short-lived-access");
  assert.equal(await session.readRefreshToken(), "rotated-refresh");
  assert.equal(credentials.values.get("CopilotBridge.Cloud.RefreshToken"), "rotated-refresh");

  await session.clear();
  assert.equal(session.getAccessToken(), null);
  assert.equal(await session.readRefreshToken(), null);
});

test("isolates refresh credentials by Cloud host and Desktop profile", () => {
  const first = cloudCredentialTarget(
    "https://ai.mddxz.top",
    "C:\\Users\\HP\\AppData\\Roaming\\copilot-bridge-app",
  );
  const same = cloudCredentialTarget(
    "https://ai.mddxz.top/",
    "c:\\users\\hp\\appdata\\roaming\\copilot-bridge-app",
  );
  const isolated = cloudCredentialTarget(
    "https://ai.mddxz.top",
    "C:\\Users\\HP\\AppData\\Local\\CopilotBridgeProductionGate",
  );
  assert.equal(first, same);
  assert.notEqual(first, isolated);
  assert.match(
    first,
    /^CopilotBridge\.Cloud\.RefreshToken\.ai\.mddxz\.top\.[0-9a-f]{16}$/,
  );
});

test("creates one stable random device UUID without hardware fingerprinting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-device-"));
  try {
    const path = join(directory, "cloud-device.json");
    const first = await new DeviceIdentityStore(path, "1.2.3").get();
    const second = await new DeviceIdentityStore(path, "1.2.3").get();
    const persisted = JSON.parse(await readFile(path, "utf8"));

    assert.match(
      first.deviceId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(second.deviceId, first.deviceId);
    assert.deepEqual(Object.keys(persisted), ["deviceId"]);
    assert.equal(first.appVersion, "1.2.3");
    assert.ok(first.deviceName);
    assert.ok(first.platform);
    assert.ok(first.osVersion);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps Cloud pending without guessing endpoints or calling the client", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-pending-"));
  try {
    const client = new MockCloudClient();
    const foundation = new CloudFoundation(
      client,
      new PendingCloudConfigurationProvider(),
      new DeviceIdentityStore(join(directory, "device.json"), "0.1.0"),
    );

    const status = await foundation.getStatus();
    assert.equal(status.authState, "SIGNED_OUT");
    assert.equal(status.contractReady, false);
    assert.equal(status.serviceStatus, "WAITING_FOR_CONTRACT");
    assert.equal(client.calls.length, 0);
    await assert.rejects(
      foundation.login(),
      CloudContractUnavailableError,
    );
    assert.equal(client.calls.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("drives foundation auth state from stable Cloud errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-state-"));
  try {
    const client = new MockCloudClient().reject(
      "login",
      new CloudError("DEVICE_REVOKED", "revoked"),
    );
    const foundation = new CloudFoundation(
      client,
      new ReadyCloudConfigurationProvider(),
      new DeviceIdentityStore(join(directory, "device.json"), "0.1.0"),
    );

    await assert.rejects(
      foundation.login({
        email: "desktop@example.test",
        password: "not-persisted",
      }),
      (error) => error instanceof CloudError && error.code === "DEVICE_REVOKED",
    );
    assert.equal((await foundation.getStatus()).authState, "DEVICE_REVOKED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deduplicates concurrent account refreshes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-refresh-"));
  try {
    const account = {
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "desktop@example.test",
        role: "USER",
        status: "ACTIVE",
      },
      subscription: null,
      plan: null,
      devices: [],
      usage: null,
    };
    const client = new MockCloudClient().respond("getAccount", account);
    const foundation = new CloudFoundation(
      client,
      new ReadyCloudConfigurationProvider(),
      new DeviceIdentityStore(join(directory, "device.json"), "0.1.0"),
    );

    await Promise.all([
      foundation.refresh(),
      foundation.refresh(),
      foundation.refresh(),
    ]);
    assert.equal(
      client.calls.filter((call) => call.method === "getAccount").length,
      1,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("MockCloudClient records opaque operations without defining DTOs", async () => {
  const client = new MockCloudClient().respond("listModels", {
    object: "list",
    data: [{
      id: "mock/mock-chat",
      object: "model",
      owned_by: "mock",
      capabilities: {
        tools: true,
        vision: false,
        reasoning: false,
        streaming: true,
      },
    }],
  });
  assert.equal((await client.listModels()).data[0].id, "mock/mock-chat");
  assert.deepEqual(client.calls, [{
    method: "listModels",
    request: undefined,
  }]);

  const pending = new PendingCloudClient();
  await assert.rejects(
    pending.createResponse(),
    CloudContractUnavailableError,
  );
});

class MemoryCredentialManager {
  values = new Map();

  async read(target) {
    return this.values.get(target) ?? null;
  }

  async write(target, secret) {
    this.values.set(target, secret);
  }

  async delete(target) {
    this.values.delete(target);
  }
}

class ReadyCloudConfigurationProvider {
  async get() {
    return {
      contractStatus: "READY",
      runtimeMode: "TEST",
      gatewayBaseUrl: null,
      accountManagementUrl: null,
      subscriptionManagementUrl: null,
    };
  }
}

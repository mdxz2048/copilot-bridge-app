import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  cloudErrorPolicy,
} from "../dist-electron/cloud/cloud-error.js";
import {
  PendingCloudConfigurationProvider,
  PRODUCTION_ACCOUNT_MANAGEMENT_URL,
  PRODUCTION_CLOUD_BASE_URL,
  resolveCloudRuntimeConfiguration,
} from "../dist-electron/cloud/cloud-config.js";
import {
  CloudFoundation,
  compareVersions,
} from "../dist-electron/cloud/cloud-foundation.js";
import { DeviceIdentityStore } from "../dist-electron/cloud/device-identity.js";
import {
  CLOUD_CONTRACT_VERSION,
  ErrorResponseV2Schema,
  ResponseSchema,
  UsageSettlementV2Schema,
} from "../dist-electron/cloud/contract.js";
import { HttpCloudClient } from "../dist-electron/cloud/http-cloud-client.js";
import { MockCloudClient } from "../dist-electron/cloud/mock-cloud-client.js";
import {
  ContractProductAccountApi,
  MockProductAccountApi,
} from "../dist-electron/cloud/product-account-api.js";
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

test("parses Contract 2.2.0 Shadow usage without treating rated points as charged", () => {
  assert.equal(CLOUD_CONTRACT_VERSION, "2.2.0");
  const response = ResponseSchema.parse({
    id: "resp_0123456789abcdef0123456789abcdef",
    object: "response",
    status: "completed",
    model: "mock/mock-chat",
    output: [],
    usage: {
      input_tokens: 8,
      output_tokens: 4,
      total_tokens: 12,
      points: 0,
      points_rated: 1,
      points_charged: 0,
      remaining_points: 10_000,
      request_id: "11111111-1111-4111-8111-111111111111",
      billing_mode: "SHADOW",
    },
  });

  const settlement = UsageSettlementV2Schema.parse({
    request: {
      id: "11111111-1111-4111-8111-111111111111",
      responseId: response.id,
      status: "COMPLETED",
      billingPolicy: "SHADOW",
      createdAt: "2026-09-24T00:00:00.000Z",
      completedAt: "2026-09-24T00:00:01.000Z",
    },
    usage: {
      inputTokens: 8,
      outputTokens: 4,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      pointsRated: 1,
      pointsCharged: 0,
      billingStatus: "SHADOW",
      rateCardVersionId: "22222222-2222-4222-8222-222222222222",
    },
    wallet: { balance: 10_000, unit: "AI_POINT" },
  });

  assert.equal(response.usage.points_rated, 1);
  assert.equal(response.usage.points_charged, 0);
  assert.equal(response.usage.billing_mode, "SHADOW");
  assert.equal(settlement.usage.billingStatus, "SHADOW");
  assert.equal(settlement.usage.pointsRated, 1);
  assert.equal(settlement.usage.pointsCharged, 0);
  assert.equal(
    response.usage.remaining_points,
    settlement.wallet.balance,
    "SHADOW requests must leave the wallet unchanged",
  );
});

test("parses Contract 2.2.0 Copilot provider errors", () => {
  for (const code of ["COPILOT_AUTH_EXPIRED", "COPILOT_USAGE_UNAVAILABLE"]) {
    assert.equal(
      ErrorResponseV2Schema.parse({
        error: {
          code,
          message: "Provider request failed.",
          request_id: "request-1",
          requestId: "request-1",
        },
      }).error.code,
      code,
    );
  }
});

test("sends optional referralCode in the Contract 2.2.0 registration request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-register-"));
  try {
    let requestBody = null;
    const client = new HttpCloudClient({
      baseUrl: "https://cloud.example.test",
      tokens: new CloudTokenSession(
        new WindowsCredentialManagerTokenStore(new MemoryCredentialManager()),
      ),
      devices: new DeviceIdentityStore(
        join(directory, "device.json"),
        "0.1.0",
      ),
      fetch: async (input, init) => {
        assert.equal(
          String(input),
          "https://cloud.example.test/api/v1/auth/register",
        );
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "new-user@example.test",
            role: "USER",
            status: "ACTIVE",
          },
        }, { status: 201 });
      },
    });

    await client.register({
      email: "new-user@example.test",
      password: "TwelveChars!",
      referralCode: "REFCODE1",
    });
    assert.deepEqual(requestBody, {
      email: "new-user@example.test",
      password: "TwelveChars!",
      referralCode: "REFCODE1",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

test("compares Server minimum and release versions", () => {
  assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
  assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
  assert.equal(compareVersions("0.1.0", "0.1.1"), -1);
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

test("centralizes V2 business error actions", () => {
  assert.deepEqual(
    cloudErrorPolicy(new CloudError("INSUFFICIENT_POINTS", "points")),
    {
      authState: "QUOTA_EXCEEDED",
      action: "ADD_POINTS",
      retryable: false,
    },
  );
  assert.equal(
    cloudErrorPolicy(
      new CloudError("PROVIDER_AUTH_REQUIRED", "provider"),
    ).action,
    "RECONNECT_PROVIDER",
  );
  assert.equal(
    cloudErrorPolicy(
      new CloudError("COPILOT_NOT_ENTITLED", "copilot"),
    ).action,
    "CHANGE_PROVIDER",
  );
  assert.deepEqual(
    cloudErrorPolicy(
      new CloudError("COPILOT_AUTH_EXPIRED", "server credential expired"),
    ),
    {
      authState: null,
      action: "CHANGE_PROVIDER",
      retryable: false,
    },
  );
  assert.deepEqual(
    cloudErrorPolicy(
      new CloudError("COPILOT_USAGE_UNAVAILABLE", "usage unavailable"),
    ),
    {
      authState: null,
      action: "RETRY",
      retryable: true,
    },
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
    const client = new MockCloudClient()
      .respond("getClientConfig", {
        minimumVersion: "0.1.0",
        latestVersion: "0.1.0",
        maintenance: false,
        features: { cloudGateway: true },
      })
      .respond("getLatestRelease", { release: null })
      .reject(
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
    const me = {
      account: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "desktop@example.test",
        status: "ACTIVE",
      },
      subscription: null,
      wallet: { balance: 0, unit: "AI_POINT" },
      activeDevices: 0,
    };
    const client = new MockCloudClient()
      .respond("getMeV2", me)
      .respond("listDevicesV2", [])
      .respond("listWalletTransactions", [])
      .respond("getUsageHistory", [])
      .respond("getUsageV2", {
        requests: 0,
        pointsRated: 0,
        pointsCharged: 0,
        legacy: null,
      })
      .respond("getReferralSummary", {
        code: "TESTCODE",
        registered: 0,
        rewarded: 0,
        pointsEarned: 0,
      })
      .respond("getReferralHistory", [])
      .respond("listProviderConnections", [])
      .respond("listProviders", [])
      .respond("getClientConfig", {
        minimumVersion: "0.1.0",
        latestVersion: "0.1.0",
        maintenance: false,
        features: { cloudGateway: true },
      })
      .respond("getLatestRelease", { release: null });
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
      client.calls.filter((call) => call.method === "getMeV2").length,
      1,
    );
    assert.equal(
      client.calls.filter((call) => call.method === "getClientConfig").length,
      1,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("login wins an overlapping stale authentication error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-login-race-"));
  try {
    let finishLogin;
    const loginBarrier = new Promise((resolve) => {
      finishLogin = resolve;
    });

    const me = {
      account: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "desktop@example.test",
        status: "ACTIVE",
      },
      subscription: null,
      wallet: { balance: 0, unit: "AI_POINT" },
      activeDevices: 1,
    };
    const client = new MockCloudClient()
      .respond("registerDevice", {
        id: "22222222-2222-4222-8222-222222222222",
        deviceId: "33333333-3333-4333-8333-333333333333",
        deviceName: "Desktop",
        platform: "win32",
        status: "ACTIVE",
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z",
      })
      .respond("getMeV2", me)
      .respond("listDevicesV2", [])
      .respond("listWalletTransactions", [])
      .respond("getUsageHistory", [])
      .respond("getUsageV2", {
        requests: 0,
        pointsRated: 0,
        pointsCharged: 0,
        legacy: null,
      })
      .respond("getReferralSummary", {
        code: "TESTCODE",
        registered: 0,
        rewarded: 0,
        pointsEarned: 0,
      })
      .respond("getReferralHistory", [])
      .respond("listProviderConnections", [])
      .respond("listProviders", [])
      .respond("getClientConfig", {
        minimumVersion: "0.1.0",
        latestVersion: "0.1.0",
        maintenance: false,
        features: { cloudGateway: true },
      })
      .respond("getLatestRelease", { release: null });
    client.login = async (request) => {
      client.calls.push({ method: "login", request });
      await loginBarrier;
      return {
        accessToken: "access",
        refreshToken: "refresh",
        expiresIn: 900,
        tokenType: "Bearer",
      };
    };
    const foundation = new CloudFoundation(
      client,
      new ReadyCloudConfigurationProvider(),
      new DeviceIdentityStore(join(directory, "device.json"), "0.1.0"),
    );

    const login = foundation.login({
      email: "desktop@example.test",
      password: "not-persisted",
    });
    await new Promise((resolve) => setImmediate(resolve));
    await foundation.handleRequestError(
      new CloudError("UNAUTHORIZED", "stale request"),
    );
    finishLogin();

    assert.equal((await login).authState, "AUTHENTICATED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps Cloud authenticated for provider-specific errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-provider-error-"));
  try {
    const me = productMe();
    const foundation = new CloudFoundation(
      configuredAccountClient(me),
      new ReadyCloudConfigurationProvider(),
      new DeviceIdentityStore(join(directory, "device.json"), "0.1.0"),
      "0.1.0",
    );
    assert.equal((await foundation.refresh()).authState, "AUTHENTICATED");

    const status = await foundation.handleRequestError(
      new CloudError("COPILOT_AUTH_EXPIRED", "Server Copilot 授权已过期。"),
    );
    assert.equal(status.authState, "AUTHENTICATED");
    assert.equal(status.lastError?.code, "COPILOT_AUTH_EXPIRED");
    assert.equal(status.lastError?.action, "CHANGE_PROVIDER");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reconciles a completed response and refreshes Server account state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-settlement-"));
  try {
    const me = productMe();
    const settlement = {
      request: {
        id: "22222222-2222-4222-8222-222222222222",
        responseId: "resp_0123456789abcdef0123456789abcdef",
        status: "COMPLETED",
        billingPolicy: "MANAGED_USAGE",
        createdAt: "2026-09-28T00:00:00.000Z",
        completedAt: "2026-09-28T00:00:01.000Z",
      },
      usage: {
        inputTokens: 8,
        outputTokens: 4,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        pointsRated: 1,
        pointsCharged: 0,
        billingStatus: "SHADOW",
        rateCardVersionId: "33333333-3333-4333-8333-333333333333",
      },
      wallet: { balance: 88, unit: "AI_POINT" },
    };
    const client = configuredAccountClient(me)
      .respond("getUsageByResponse", settlement);
    const foundation = new CloudFoundation(
      client,
      new ReadyCloudConfigurationProvider(),
      new DeviceIdentityStore(join(directory, "device.json"), "0.1.0"),
      "0.1.0",
    );

    const result = await foundation.reconcileResponse({
      responseId: settlement.request.responseId,
    });

    assert.equal(result.settlement.usage?.billingStatus, "SHADOW");
    assert.equal(result.status.remainingPoints, 88);
    assert.equal(
      client.calls.filter((call) => call.method === "getUsageByResponse").length,
      1,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("prefers request lookup when recovering an interrupted stream", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-recovery-"));
  try {
    const settlement = {
      request: {
        id: "22222222-2222-4222-8222-222222222222",
        responseId: "resp_0123456789abcdef0123456789abcdef",
        status: "CLIENT_DISCONNECTED",
        billingPolicy: "MANAGED_USAGE",
        createdAt: "2026-09-28T00:00:00.000Z",
        completedAt: "2026-09-28T00:00:01.000Z",
      },
      usage: {
        inputTokens: 8,
        outputTokens: 4,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        pointsRated: 1,
        pointsCharged: 0,
        billingStatus: "SHADOW",
        rateCardVersionId: "33333333-3333-4333-8333-333333333333",
      },
      wallet: { balance: 88, unit: "AI_POINT" },
    };
    const client = configuredAccountClient(productMe())
      .respond("getUsageByRequest", settlement)
      .reject(
        "getUsageByResponse",
        new Error("response lookup must not be used for recovery"),
      );
    const foundation = new CloudFoundation(
      client,
      new ReadyCloudConfigurationProvider(),
      new DeviceIdentityStore(join(directory, "device.json"), "0.1.0"),
      "0.1.0",
    );

    await foundation.reconcileResponse({
      responseId: settlement.request.responseId,
      requestId: settlement.request.id,
      recovery: true,
    });
    assert.equal(
      client.calls.filter((call) => call.method === "getUsageByRequest").length,
      1,
    );
    assert.equal(
      client.calls.filter((call) => call.method === "getUsageByResponse").length,
      0,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps account refresh available when release metadata fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-cloud-config-error-"));
  try {
    const client = configuredAccountClient(productMe())
      .reject("getLatestRelease", new Error("release endpoint unavailable"));
    const foundation = new CloudFoundation(
      client,
      new ReadyCloudConfigurationProvider(),
      new DeviceIdentityStore(join(directory, "device.json"), "0.1.0"),
      "0.1.0",
    );

    const status = await foundation.refresh();
    assert.equal(status.authState, "AUTHENTICATED");
    assert.equal(status.remainingPoints, 88);
    assert.equal(status.clientConfig?.features.cloudGateway, true);
    assert.match(status.serviceConfigurationError ?? "", /release endpoint/);
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

test("keeps V2 product account APIs behind replaceable adapters", async () => {
  const me = {
    account: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "desktop@example.test",
      status: "ACTIVE",
    },
    subscription: null,
    wallet: { balance: 88, unit: "AI_POINT" },
    activeDevices: 1,
  };
  const snapshot = {
    me,
    wallet: me.wallet,
    usage: {
      requests: 1,
      pointsRated: 12,
      pointsCharged: 12,
      legacy: null,
    },
    devices: [],
    walletTransactions: [],
    usageHistory: [],
    referral: {
      code: "TESTCODE",
      registered: 0,
      rewarded: 0,
      pointsEarned: 0,
    },
    referralHistory: [],
    providers: [],
    providerConnections: [],
  };
  const cloud = new MockCloudClient()
    .respond("getMeV2", me)
    .respond("getWallet", snapshot.wallet)
    .respond("getUsageV2", snapshot.usage)
    .respond("listDevicesV2", [])
    .respond("listWalletTransactions", [])
    .respond("getUsageHistory", [])
    .respond("getReferralSummary", snapshot.referral)
    .respond("getReferralHistory", [])
    .respond("listProviders", [])
    .respond("listProviderConnections", []);
  const adapter = new ContractProductAccountApi(cloud);
  assert.deepEqual(await adapter.getSnapshot(), snapshot);

  const mock = new MockProductAccountApi();
  mock.snapshot = snapshot;
  assert.deepEqual(await mock.getSnapshot(), snapshot);
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

function productMe() {
  return {
    account: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "desktop@example.test",
      status: "ACTIVE",
    },
    subscription: null,
    wallet: { balance: 88, unit: "AI_POINT" },
    activeDevices: 1,
  };
}

function configuredAccountClient(me) {
  return new MockCloudClient()
    .respond("getMeV2", me)
    .respond("listDevicesV2", [])
    .respond("listWalletTransactions", [])
    .respond("getUsageHistory", [])
    .respond("getUsageV2", {
      requests: 1,
      pointsRated: 1,
      pointsCharged: 0,
      legacy: null,
    })
    .respond("getReferralSummary", {
      code: "TESTCODE",
      registered: 0,
      rewarded: 0,
      pointsEarned: 0,
    })
    .respond("getReferralHistory", [])
    .respond("listProviderConnections", [])
    .respond("listProviders", [])
    .respond("getClientConfig", {
      minimumVersion: "0.1.0",
      latestVersion: "0.1.0",
      maintenance: false,
      features: { cloudGateway: true },
    })
    .respond("getLatestRelease", { release: null });
}

import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DeviceIdentityStore } from "../dist-electron/cloud/device-identity.js";
import { HttpCloudClient } from "../dist-electron/cloud/http-cloud-client.js";
import {
  cloudCredentialTarget,
  CloudTokenSession,
  WindowsCredentialManagerTokenStore,
} from "../dist-electron/cloud/token-store.js";
import {
  WindowsPasswordVaultCredentialManager,
} from "../dist-electron/cloud/windows-credential-manager.js";

const baseUrl = process.env.COPILOT_BRIDGE_CLOUD_BASE_URL
  ?? "https://ai.mddxz.top";
const userData = process.env.COPILOT_BRIDGE_V2_USER_DATA
  ?? join(process.env.APPDATA ?? "", "copilot-bridge-app");
const deviceStore = new DeviceIdentityStore(
  join(userData, "cloud-device.json"),
  "0.1.0",
);
const tokenStore = new WindowsCredentialManagerTokenStore(
  new WindowsPasswordVaultCredentialManager(),
  cloudCredentialTarget(baseUrl, userData),
);
const tokens = new CloudTokenSession(tokenStore);
const client = new HttpCloudClient({
  baseUrl,
  tokens,
  devices: deviceStore,
  timeoutMs: 30_000,
});

const results = {};
const evidence = {};

let me;
try {
  me = await client.getMeV2();
} catch (error) {
  if (
    !(
      error
      && typeof error === "object"
      && "code" in error
      && (error.code === "UNAUTHORIZED" || error.code === "TOKEN_EXPIRED")
    )
  ) throw error;
  const email = process.env.COPILOT_BRIDGE_E2E_EMAIL;
  const password = process.env.COPILOT_BRIDGE_E2E_PASSWORD;
  if (!email || !password) throw error;
  await client.login({
    email,
    password,
    device: await deviceStore.get(),
  });
  me = await client.getMeV2();
}
const wallet = await client.getWallet();
const usageBefore = await client.getUsageV2();
const devices = await client.listDevicesV2();
const transactions = await client.listWalletTransactions();
const referral = await client.getReferralSummary();
const referralHistory = await client.getReferralHistory();
const providers = await client.listProviders();
const providerConnections = await client.listProviderConnections();
const providerModels = [];
for (const provider of providers) {
  providerModels.push({
    provider: provider.code,
    models: (await client.listProviderModels(provider.id))
      .map((model) => model.publicId),
  });
}

const identity = await deviceStore.get();
const currentDevice = devices.find(
  (device) => device.deviceId === identity.deviceId,
);

results.account = pass(me.account.status === "ACTIVE");
results.wallet = pass(
  wallet.unit === "AI_POINT"
    && Number.isInteger(wallet.balance)
    && wallet.balance >= 0,
);
results.usage = pass(
  Number.isInteger(usageBefore.pointsRated)
    && Number.isInteger(usageBefore.pointsCharged),
);
results.devices = pass(
  currentDevice?.status === "ACTIVE",
);
results.deviceRename = currentDevice
  ? pass(
      (await client.renameDevice(currentDevice.id, currentDevice.deviceName))
        .deviceName === currentDevice.deviceName,
    )
  : pass(false);
results.walletTransactions = pass(Array.isArray(transactions));
results.referral = pass(
  referral.code.length >= 8
    && Array.isArray(referralHistory),
);
results.providers = pass(
  providers.every((provider) =>
    providerModels.some((entry) => entry.provider === provider.code)
  ),
);
results.providerConnections = pass(Array.isArray(providerConnections));

const models = await client.listModels();
const model = models.data[0]?.id;
let responseId = null;
let responseUsage = null;
if (model) {
  const transport = await client.createResponse(
    {
      model,
      input: "Production V2 settlement probe",
      stream: false,
    },
    { threadId: randomUUID() },
  );
  const response = await transport.response.json();
  responseId = response.id ?? null;
  responseUsage = response.usage ?? null;
  results.response = pass(response.status === "completed");
} else {
  results.response = pass(false);
}

const usageAfter = await client.getUsageV2();
const walletAfter = await client.getWallet();
results.usageRefresh = pass(usageAfter.requests >= usageBefore.requests);
let settlementCode = null;
let settlement = null;
if (responseId) {
  try {
    settlement = await client.getUsageByResponse(responseId);
  } catch (error) {
    settlementCode = error && typeof error === "object" && "code" in error
      ? error.code
      : null;
  }
}
results.settlement = pass(
  settlement?.request.responseId === responseId
    && settlement?.usage?.billingStatus === "SHADOW"
    && settlement.usage.pointsRated > 0
    && settlement.usage.pointsCharged === 0,
);
results.shadow = pass(
  responseUsage?.points_rated > 0
    && responseUsage?.points_charged === 0
    && responseUsage?.billing_mode === "SHADOW",
);
results.walletUnchanged = pass(walletAfter.balance === wallet.balance);

evidence.contract = {
  apiV2: "2.2.0",
  generatedOpenApi: "2.2.0",
};
evidence.account = {
  plan: me.subscription?.planCode ?? null,
  subscription: me.subscription?.status ?? null,
  activeDevices: me.activeDevices,
};
evidence.wallet = {
  balance: wallet.balance,
  transactionCount: transactions.length,
};
evidence.usage = {
  before: usageBefore,
  after: usageAfter,
  responseUsage,
  settlement,
  settlementCode,
};
evidence.shadow = {
  responseId,
  pointsRated: responseUsage?.points_rated ?? null,
  pointsCharged: responseUsage?.points_charged ?? null,
  billingStatus: responseUsage?.billing_mode ?? null,
  walletBefore: wallet.balance,
  walletAfter: walletAfter.balance,
  settlement,
};
evidence.referral = {
  codePresent: referral.code.length > 0,
  registered: referral.registered,
  rewarded: referral.rewarded,
  pointsEarned: referral.pointsEarned,
  historyCount: referralHistory.length,
};
evidence.providers = providerModels;
evidence.providerConnections = providerConnections.map((connection) => ({
  providerId: connection.providerId,
  status: connection.status,
  label: connection.label,
}));

const passed = Object.values(results).every(
  (result) => result.status === "PASS",
);
console.log(JSON.stringify({
  result: passed ? "PASS" : "FAIL",
  results,
  evidence,
}, null, 2));
if (!passed) process.exitCode = 1;

function pass(condition) {
  return { status: condition ? "PASS" : "FAIL" };
}

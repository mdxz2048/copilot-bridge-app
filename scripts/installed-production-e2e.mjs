import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

const executable = process.env.COPILOT_BRIDGE_INSTALLED_EXE
  ?? join(
    process.env.LOCALAPPDATA ?? "",
    "Programs",
    "Copilot Bridge",
    "Copilot Bridge.exe",
  );
const email = process.env.COPILOT_BRIDGE_E2E_EMAIL?.trim() || null;
const password = process.env.COPILOT_BRIDGE_E2E_PASSWORD || null;
const keepRunning =
  process.env.COPILOT_BRIDGE_INSTALLED_E2E_KEEP_RUNNING === "1";
const useDefaultUserData =
  process.env.COPILOT_BRIDGE_INSTALLED_E2E_USE_DEFAULT_USER_DATA === "1";
const lifecycleGate =
  process.env.COPILOT_BRIDGE_INSTALLED_E2E_LIFECYCLE === "1";
const screenshotDirectory =
  process.env.COPILOT_BRIDGE_INSTALLED_E2E_SCREENSHOT_DIR;
const deviceScaleFactor =
  process.env.COPILOT_BRIDGE_INSTALLED_E2E_SCALE_FACTOR;
const screenshotSuffix = deviceScaleFactor
  ? `-${deviceScaleFactor.replace(".", "_")}x`
  : "";
const userData = useDefaultUserData
  ? null
  : process.env.COPILOT_BRIDGE_INSTALLED_E2E_USER_DATA
    ?? join(process.env.LOCALAPPDATA ?? "", "CopilotBridgeProductionGate");
const debugPort = await findAvailablePort();
if (userData) {
  await mkdir(userData, { recursive: true });
  await writeFile(
    join(userData, "settings.json"),
    `${JSON.stringify({
      backendModel: null,
      reasoningEffort: null,
      autoLaunch: false,
      minimizeToTray: false,
      autoBridgeStart: false,
      backendMode: "LOCAL",
      providerConnectionId: null,
      theme: "system",
      onboardingCompleted: true,
    }, null, 2)}\n`,
    "utf8",
  );
}

const app = spawn(
  executable,
  [
    `--remote-debugging-port=${String(debugPort)}`,
    ...(userData ? [`--user-data-dir=${userData}`] : []),
    ...(deviceScaleFactor
      ? [`--force-device-scale-factor=${deviceScaleFactor}`]
      : []),
  ],
  {
    env: {
      ...process.env,
      COPILOT_BRIDGE_CLOUD_MODE: "PRODUCTION",
    },
    windowsHide: false,
    stdio: "ignore",
  },
);

let cdp;
const results = {};
const evidence = {};
try {
  const target = await waitForRenderer(debugPort);
  cdp = await createCdpClient(target.webSocketDebuggerUrl);

  const before = await cdp.evaluate(
    "window.copilotBridge.getCloudStatus()",
  );
  results.productionDefault = pass(
    before.contractReady
      && (
        before.authState === "SIGNED_OUT"
        || before.authState === "AUTHENTICATED"
      ),
  );

  const login = before.authState === "AUTHENTICATED"
    ? before
    : email && password
      ? await cdp.evaluate(
          `window.copilotBridge.loginCloud(${JSON.stringify({ email, password })})`,
        )
      : (() => {
          throw new Error(
            "COPILOT_BRIDGE_E2E_EMAIL and COPILOT_BRIDGE_E2E_PASSWORD are required when the installed profile is signed out",
          );
        })();
  results.login = pass(
    login.authState === "AUTHENTICATED"
      && (!email || login.account === email),
  );
  results.contract = pass(login.contractVersion === "2.2.0");
  results.account = pass(Boolean(login.account));
  results.device = pass(login.currentDevice.includes("已激活"));
  results.subscription = pass(
    login.plan === "Pro" && login.subscriptionStatus === "ACTIVE",
  );
  results.usage = pass(typeof login.usage === "string" && login.usage.length > 0);

  const settings = await cdp.evaluate(
    "window.copilotBridge.getSettings()",
  );
  const remoteSettings = {
    ...settings,
    backendMode: "REMOTE",
    backendModel: "mock/mock-chat",
    ...(lifecycleGate && {
      autoLaunch: true,
      minimizeToTray: true,
      autoBridgeStart: true,
    }),
  };
  await cdp.evaluate(
    `window.copilotBridge.updateSettings(${JSON.stringify({
      ...remoteSettings,
      backendMode: settings.backendMode,
    })})`,
  );
  const bridge = settings.backendMode === "REMOTE"
    ? await cdp.evaluate(
        `window.copilotBridge.getBridgeStatus().then((status) =>
          status.state === "ready"
            ? status
            : window.copilotBridge.restartBridge()
        )`,
      )
    : (
        await cdp.evaluate("window.copilotBridge.switchAiService('REMOTE')")
      ).bridge;
  await cdp.evaluate("location.reload()");
  await delay(800);
  const models = await cdp.evaluate(
    "window.copilotBridge.getModels()",
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await cdp.evaluate(
      `(() => {
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent?.trim() === '稍后')
          ?.click();
        return true;
      })()`,
    );
    await delay(100);
  }
  results.remoteBridge = pass(
    bridge.state === "ready"
      && bridge.endpoint === "http://127.0.0.1:8787",
  );
  results.models = pass(
    models.some((model) => model.id === "mock/mock-chat"),
  );
  const cloudBefore = await cdp.evaluate(
    "window.copilotBridge.refreshCloud()",
  );
  results.provider = pass(
    cloudBefore.providers.some((provider) =>
      provider.models.some((model) => model.publicId === "mock/mock-chat")
    ),
  );
  results.wallet = pass(
    cloudBefore.remainingPoints === 10_000
      && cloudBefore.usageV2?.pointsCharged >= 0,
  );
  results.referral = pass(
    typeof cloudBefore.referral?.code === "string"
      && cloudBefore.referral.code.length >= 8,
  );

  const textResponse = await fetch("http://127.0.0.1:8787/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "mock/mock-chat",
      input: "Installed production text E2E",
      stream: false,
    }),
  });
  const textPayload = await textResponse.json();
  results.text = pass(
    textResponse.ok
      && textPayload.status === "completed"
      && responseText(textPayload).includes("Installed production text E2E"),
  );
  let settlement = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    settlement = await cdp.evaluate(
      `window.copilotBridge.getCloudUsageSettlement(${
        JSON.stringify(textPayload.id)
      })`,
    );
    if (settlement.usage) break;
    await delay(200);
  }
  const responseUsage = textPayload.usage ?? {};
  results.shadow = pass(
    responseUsage.points_rated > 0
      && responseUsage.points_charged === 0
      && responseUsage.points === 0
      && responseUsage.billing_mode === "SHADOW",
  );
  results.settlement = pass(
    settlement?.request?.responseId === textPayload.id
      && settlement?.usage?.pointsRated === responseUsage.points_rated
      && settlement?.usage?.pointsCharged === 0
      && settlement?.usage?.billingStatus === "SHADOW",
  );

  const streamResponse = await fetch("http://127.0.0.1:8787/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "mock/mock-chat",
      input: "Installed production SSE E2E",
      stream: true,
    }),
  });
  const streamText = await streamResponse.text();
  results.sse = pass(
    streamResponse.ok
      && streamText.includes("event: response.created")
      && streamText.includes("event: response.completed")
      && streamText.includes("data: [DONE]"),
  );
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    await cdp.captureScreenshot(
      join(screenshotDirectory, `installed-cloud-main${screenshotSuffix}.png`),
    );
  }

  await cdp.evaluate(
    `(() => {
      document.querySelector('.account-status-button')?.click();
      return true;
    })()`,
  );
  await delay(200);
  const accountUi = await cdp.evaluate(
    "document.querySelector('.sheet')?.innerText ?? ''",
  );
  evidence.accountUi = accountUi;
  results.accountUi = pass(
    accountUi.includes(login.account)
      && accountUi.includes("Pro")
      && accountUi.includes("有效")
      && accountUi.includes("台设备")
      && accountUi.includes("管理账号")
      && !accountUi.includes("已扣除"),
  );
  if (screenshotDirectory) {
    await cdp.captureScreenshot(
      join(screenshotDirectory, `installed-cloud-account${screenshotSuffix}.png`),
    );
  }

  const refreshed = await cdp.evaluate(
    "window.copilotBridge.refreshCloud()",
  );
  results.refresh = pass(refreshed.authState === "AUTHENTICATED");
  results.walletUnchanged = pass(
    refreshed.remainingPoints === cloudBefore.remainingPoints
      && settlement?.wallet?.balance === cloudBefore.remainingPoints,
  );
  results.usage = pass(
    refreshed.usageV2?.requests >= cloudBefore.usageV2?.requests
      && refreshed.usageV2?.pointsRated > cloudBefore.usageV2?.pointsRated
      && refreshed.usageV2?.pointsCharged
        === cloudBefore.usageV2?.pointsCharged,
  );

  evidence.app = {
    executable,
    pid: app.pid,
    userData: userData ?? "default",
    debugPort,
  };
  evidence.account = {
    plan: login.plan,
    subscription: login.subscriptionStatus,
    device: login.currentDevice,
    usage: login.usage,
  };
  evidence.models = models.map((model) => model.id);
  evidence.bridge = bridge;
  evidence.shadow = {
    responseId: textPayload.id,
    requestId: responseUsage.request_id ?? null,
    pointsRated: responseUsage.points_rated ?? null,
    pointsCharged: responseUsage.points_charged ?? null,
    billingStatus: responseUsage.billing_mode ?? null,
    walletBefore: cloudBefore.remainingPoints,
    walletAfter: refreshed.remainingPoints,
    settlement,
  };
} finally {
  cdp?.close();
  if (!keepRunning) {
    if (app.exitCode === null) app.kill();
    await delay(1_000);
  }
}

const passed = Object.values(results).every(
  (result) => result.status === "PASS",
);
console.log(JSON.stringify({
  result: passed ? "PASS" : "FAIL",
  results,
  evidence,
  keepRunning,
}, null, 2));
if (!passed) process.exitCode = 1;

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

async function waitForRenderer(port) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) =>
          target.type === "page" && target.webSocketDebuggerUrl
        );
        if (page) return page;
      }
    } catch {}
    await delay(250);
  }
  throw new Error("Installed renderer did not expose a CDP target.");
}

function createCdpClient(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("open", () => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (!message.id) return;
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      });

      const call = (method, params = {}) => new Promise(
        (resolveCall, rejectCall) => {
          const id = nextId++;
          pending.set(id, { resolve: resolveCall, reject: rejectCall });
          socket.send(JSON.stringify({ id, method, params }));
        },
      );

      resolve({
        async evaluate(expression) {
          const result = await call("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          if (result.exceptionDetails) {
            throw new Error(
              result.exceptionDetails.exception?.description
                ?? result.exceptionDetails.text,
            );
          }
          return result.result.value;
        },
        close() {
          socket.close();
        },
        async captureScreenshot(path) {
          const result = await call("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
          });
          await writeFile(path, result.data, "base64");
        },
      });
    }, { once: true });
  });
}

function findAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a CDP port."));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

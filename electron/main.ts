import { createBridgeRecovery } from './bridge-recovery.js';
import {inviteMessage} from "./invite-message.js";
import { ConversationCache } from './cloud/conversation-cache.js';
import { safeStorage } from 'electron';
import { BridgeTrace } from './cloud/bridge-trace.js';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, shell, Tray } from "electron";
import { UpdateManager } from './update-manager.js';
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { BridgeManager } from "./bridge-manager.js";
import { ChatGptManager, type ChatGptStatus } from "./chatgpt-manager.js";
import { type ProfileId } from "./profile-store.js";
import { GatewayProfileStore } from "./gateway-profile-store.js";
import { SettingsStore, type AppSettings } from "./settings-store.js";
import { requireCloudMode, requireCloudTarget, migrateCloudMode } from "./cloud-mode-policy.js";
import {
  cloudRegistrationUrl,
  resolveCloudRuntimeConfiguration,
  StaticCloudConfigurationProvider,
} from "./cloud/cloud-config.js";
import { DeviceIdentityStore } from "./cloud/device-identity.js";
import { DeviceKeyStore } from "./cloud/device-proof.js";
import { CloudFoundation } from "./cloud/cloud-foundation.js";
import { createFocusRefresh } from "./cloud/focus-refresh.js";
import { HttpCloudClient } from "./cloud/http-cloud-client.js";
import {
  cloudCredentialTarget,
  cloudDeviceKeyTarget,
  CloudTokenSession,
  WindowsCredentialManagerTokenStore,
} from "./cloud/token-store.js";
import {
  WindowsPasswordVaultCredentialManager,
} from "./cloud/windows-credential-manager.js";
import { RemoteBridgeServer } from "./cloud/remote-bridge-server.js";
import { FailureFeedbackOutbox } from "./cloud/failure-feedback.js";
import { performServiceSwitch } from "./service-switcher.js";
import { prepareOfficialClientConnection, restartOfficialClientForProfile } from "./official-client-flow.js";

const bridgeHome = join(process.env.USERPROFILE ?? "", ".copilot-bridge", "profiles", "bridge", "codex-home");
const originalHome = join(process.env.USERPROFILE ?? "", ".codex");
const proxyEntrypoint = app.isPackaged
  ? join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "copilot-sdk-proxy",
      "dist",
      "cli.js",
    )
  : join(app.getAppPath(), "node_modules", "copilot-sdk-proxy", "dist", "cli.js");
const effectiveCodexHome = process.env.CODEX_HOME || originalHome;
const localCredentialTarget = `CopilotBridge.LocalGateway.${app.getPath("userData").replace(/[^a-zA-Z0-9]/g, "_")}`;
const localCredentials = new WindowsPasswordVaultCredentialManager();
let localGatewayKey: string | null = null;
let startupWarning:string|null=null;
const helperPath = app.isPackaged
  ? join(process.resourcesPath, "gateway-runtime", "gateway-token-helper.mjs")
  : join(app.getAppPath(), "dist-electron", "gateway-token-helper.mjs");
const profileStore = new GatewayProfileStore(effectiveCodexHome,
  join(app.getPath("userData"), "gateway-switch.json"), nodePathForCurrentBuild(), [helperPath, localCredentialTarget]);
const chatGptManager = new ChatGptManager(logDiagnostic, { offlineDirectory:join(app.getPath("userData"),"official-client") });
function nodePathForCurrentBuild(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "node-runtime", "node.exe")
    : join(app.getAppPath(), "resources", "node-runtime", "node.exe");
}
const settingsStore = new SettingsStore(join(app.getPath("userData"), "settings.json"));
const cloudRuntimeConfiguration = resolveCloudRuntimeConfiguration({
  isPackaged: app.isPackaged,
});
const cloudConfiguration = new StaticCloudConfigurationProvider(
  cloudRuntimeConfiguration,
);
const cloudDeviceIdentity = new DeviceIdentityStore(
  join(app.getPath("userData"), "cloud-device.json"),
  app.getVersion(),
);
const cloudBaseUrl = cloudRuntimeConfiguration.gatewayBaseUrl;
if (!cloudBaseUrl) {
  throw new Error("Cloud base URL is unavailable.");
}
const cloudTokens = new CloudTokenSession(
  new WindowsCredentialManagerTokenStore(
    new WindowsPasswordVaultCredentialManager(),
    cloudCredentialTarget(cloudBaseUrl, app.getPath("userData")),
  ),
);
const cloudClient = new HttpCloudClient({
  baseUrl: cloudBaseUrl,
  tokens: cloudTokens,
  devices: cloudDeviceIdentity,
  deviceKeys: new DeviceKeyStore(
    new WindowsPasswordVaultCredentialManager(),
    cloudDeviceKeyTarget(cloudBaseUrl, app.getPath("userData")),
  ),
});
const failureFeedback=new FailureFeedbackOutbox({
  path:join(app.getPath("userData"),"diagnostics","failure-outbox.enc"),encryption:safeStorage,
  owner:()=>cloudClient.getCachedUserId(),upload:report=>cloudClient.submitFailureFeedback(report),
});
const updater = new UpdateManager({
  currentVersion: app.getVersion(), baseUrl: cloudBaseUrl,
  directory: join(app.getPath('userData'), 'updates'),
  latest: async () => (await cloudClient.getLatestRelease()).release,
  changed: status => broadcast('update:status', status),
});
let installingUpdate = false;
async function installUpdate(): Promise<void> {
  if (installingUpdate) return;
  installingUpdate = true;
  try {
    const path = await updater.installer();
    const error = await shell.openPath(path);
    if (error) throw new Error(error);
    await bridgeManager.stop().catch(() => undefined);
    app.quit();
  } catch (error) { installingUpdate = false; throw error; }
}
async function checkForUpdates(manual = false): Promise<void> {
  if (isIsolatedTestInstance && !manual) return;
  await updater.check();
}
function checkUpdatesOnOpen(): void {
  void checkForUpdates().catch(error => logDiagnostic(`Update failed: ${error instanceof Error ? error.message : String(error)}`));
}
const cloudFoundation = new CloudFoundation(
  cloudClient,
  cloudConfiguration,
  cloudDeviceIdentity,
  app.getVersion(),
);
const remoteBridge = new RemoteBridgeServer(
  cloudClient,
  8787,
  (error) => {
    void cloudFoundation.handleRequestError(error).then(async (status) => {
      if (status.authState === "DEVICE_REVOKED") {
        await cloudTokens.clear();
        const bridge = await remoteBridge.stop();
        broadcast("bridge:status", bridge);
      }
      broadcast("cloud:status", status);
    });
  },
  undefined,
  async (target) => {
    const { status } = await cloudFoundation.reconcileResponse(target);
    broadcast("cloud:status", status);
  },
  {
    onConnectionObserved: async () => {
      const before = await profileStore.getStatus();
      if (before.pendingProfile !== 'bridge' || before.activeProfile !== 'bridge') return;
      const status = await profileStore.acknowledgeBridgeActivity();
      broadcast('profile:status', status);
    },
    cache: new ConversationCache(join(app.getPath("userData"), "cloud-conversations.enc"),safeStorage),
    trace: new BridgeTrace(join(app.getPath("userData"), "diagnostics")),
    getApiKey: async () => localGatewayKey,
    getModel: async () => (await settingsStore.read()).backendModel,
    getReasoning: async () => (await settingsStore.read()).reasoningMode ?? "auto",
    failureFeedback:{appVersion:app.getVersion(),ownerUserId:()=>cloudClient.getCachedUserId(),submit:report=>failureFeedback.enqueue(report)},
  },
);
const bridgeManager = new BridgeManager(
  app.getPath("userData"),
  proxyEntrypoint,
  nodePathForCurrentBuild(),
  runtimePathForCurrentBuild(),
  bridgeHome,
  8787,
  remoteBridge,
  async () => localGatewayKey,
);
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentSettings: AppSettings | null = null;
const isIsolatedTestInstance = process.argv.some((argument) =>
  argument.startsWith("--user-data-dir="),
);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function logDiagnostic(message: string): void {
  const logPath = join(app.getPath("userData"), "copilot-bridge.log");
  void mkdir(app.getPath("userData"), { recursive: true })
    .then(() => appendFile(logPath, `${new Date().toISOString()} ${message}\n`, "utf8"))
    .catch(() => undefined);
}

function runtimePathForCurrentBuild(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "copilot-runtime", "copilot.exe")
    : join(app.getAppPath(), "node_modules", "@github", "copilot-win32-x64", "copilot.exe");
}

function sendChatGptStatus(status: ChatGptStatus): void {
  broadcast("chatgpt:status", status);
}

async function prepareBridgeEnvironment(): Promise<void> {
  try { await prepareLocalCredentials();startupWarning=null; }
  catch(error){startupWarning=error instanceof Error?error.message:'本地连接初始化失败，请稍后重试。';throw error;}
}

async function prepareLocalCredentials(): Promise<void> {
  await mkdir(bridgeHome, { recursive: true });
  const configPath = join(bridgeHome, "config.toml");
  if (!existsSync(configPath)) {
    await writeFile(
      configPath,
      `model = "gpt-5.5"
model_provider = "copilot_bridge"
approval_policy = "on-request"
sandbox_mode = "danger-full-access"

[model_providers.copilot_bridge]
name = "Copilot Bridge"
base_url = "http://127.0.0.1:8787/v1"
env_key = "COPILOT_BRIDGE_API_KEY"
wire_api = "responses"
`,
      "utf8",
    );
  }
  localGatewayKey = await localCredentials.read(localCredentialTarget);
  if (!localGatewayKey) {
    localGatewayKey = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    await localCredentials.write(localCredentialTarget, localGatewayKey);
  }
}

async function startBridge(): Promise<void> {
  if(!localGatewayKey)await prepareBridgeEnvironment();
  const settings = await settingsStore.read();
  requireCloudMode(settings);
  const status = await bridgeManager.start(settings);
  broadcast("bridge:status", status);
  refreshTray();
}

const recoverCloudBridge = createBridgeRecovery({
  eligible: async () => {
    const [cloud, profile, settings] = await Promise.all([cloudFoundation.getStatus(), profileStore.getStatus(), settingsStore.read()]);
    return settings.backendMode === 'REMOTE' && profile.activeProfile === 'bridge'
      && cloud.authState === 'AUTHENTICATED' && cloud.serviceStatus === 'AVAILABLE' && !cloud.lastError;
  },
  status: () => bridgeManager.getStatus(),
  start: async () => { await startBridge(); return bridgeManager.getStatus(); },
});

async function refreshCloudStatus(): Promise<void> {
  try {
    const status = await cloudFoundation.refresh();
    broadcast("cloud:status", status);
    if(status.loginDeviceLimit)return;
    await recoverCloudBridge(true);
    const settings = await settingsStore.read();
    if (
      settings.backendMode === "REMOTE"
      && status.serviceStatus !== "AVAILABLE"
    ) {
      const bridge = await bridgeManager.stop();
      broadcast("bridge:status", bridge);
      refreshTray();
    }
  } catch (error) {
    logDiagnostic(
      `Cloud status refresh failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    broadcast("cloud:status", await cloudFoundation.getStatus());
  }
}

const refreshCloudOnFocus = createFocusRefresh(
  () => cloudTokens.getAccessToken() !== null,
  refreshCloudStatus,
);

async function switchAiService(
  target: AppSettings["backendMode"],
): Promise<{
  settings: AppSettings;
  bridge: ReturnType<BridgeManager["getStatus"]>;
  models: Awaited<ReturnType<BridgeManager["models"]>>;
}> {
  requireCloudTarget(target);
  try {
    await requireInstalledChatGpt();
    const result = await performServiceSwitch(target, {
      readSettings: () => settingsStore.read(),
      writeSettings: (settings) => settingsStore.write(settings),
      refreshCloud: () => cloudFoundation.refresh(),
      restartBridge: (settings) => bridgeManager.restart(settings),
      listModels: () => bridgeManager.models(),
    });
    currentSettings = result.settings;
    broadcast("bridge:status", result.bridge);
    refreshTray();
    return result;
  } catch (error) {
    broadcast("bridge:status", bridgeManager.getStatus());
    refreshTray();
    throw error;
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}
async function requireInstalledChatGpt(): Promise<void> {
  const status = await chatGptManager.detect();
  sendChatGptStatus(status);
  if (status.state !== 'INSTALLED') throw new Error('请先安装 ChatGPT，安装完成后才能开启或切换 Bridge。');
}

function applicationIconPath() {
  return join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(),"resources"),"icons",process.platform === "win32" ? "bridge.ico" : "bridge.png");
}

function createTrayIcon() {
  return nativeImage.createFromPath(applicationIconPath());
}

function ensureTray(): void {
  if (tray) return;
  tray = new Tray(createTrayIcon());
  tray.on("click", focusMainWindow);
  refreshTray();
}

function refreshTray(): void {
  if (!tray) return;
  const bridge = bridgeManager.getStatus();
  const profile = "模型网关";
  tray.setToolTip(`Copilot Bridge — ${bridge.state === "ready" ? "正常" : bridge.message}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Copilot Bridge", enabled: false },
    { label: bridge.state === "ready" ? "● Bridge 正常" : `○ ${bridge.message}`, enabled: false },
    { type: "separator" },
    { label: "打开 Copilot Bridge", click: focusMainWindow },
    {
      label: "重新启动 Bridge",
      click: () => {
        void settingsStore.read().then((settings) => { requireCloudMode(settings); return bridgeManager.restart(settings); }).then((status) => {
          broadcast("bridge:status", status);
          refreshTray();
        });
      },
    },
    { label: `当前环境：${profile}`, enabled: false },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function titleBarOverlayColors() {
  return nativeTheme.shouldUseDarkColors
    ? { color: "#202633", symbolColor: "#F5F5F7", height: 48 }
    : { color: "#F4F7FC", symbolColor: "#142033", height: 48 };
}

function updateTitleBarOverlay(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitleBarOverlay(titleBarOverlayColors());
  }
}

function applyTheme(theme: AppSettings["theme"]): void {
  nativeTheme.themeSource = theme;
  updateTitleBarOverlay();
}

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return;
  }
  const window = new BrowserWindow({
    icon: applicationIconPath(),
    width: 900,
    height: 700,
    minWidth: 720,
    minHeight: 520,
    center: true,
    titleBarStyle: "hidden",
    titleBarOverlay: titleBarOverlayColors(),
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = window;
  window.webContents.once("did-finish-load", () => {
    if(isIsolatedTestInstance)return;
    void chatGptManager.ensureInstalledOnOpen(sendChatGptStatus,
      () => shell.openExternal(ChatGptManager.storeUri()),
      () => shell.openExternal(ChatGptManager.downloadPageUri()))
      .catch(error=>logDiagnostic(`Automatic official installation check failed: ${error instanceof Error?error.message:String(error)}`));
  });
  checkUpdatesOnOpen();
  window.on("closed", () => {
    logDiagnostic("Bridge window closed");
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  window.on("focus", () => {
    void chatGptManager.refreshStatus(sendChatGptStatus);
    void refreshCloudOnFocus()?.catch((error: unknown) => {
      logDiagnostic(`Cloud focus refresh failed: ${
        error instanceof Error ? error.message : String(error)
      }`);
    });
  });
  window.on("close", (event) => {
    if (isQuitting || currentSettings?.minimizeToTray === false) return;
    event.preventDefault();
    logDiagnostic("Bridge window hidden; gateway remains running");
    window.hide();
  });
  window.webContents.on("console-message", (_event, _level, message, line, sourceId) => {
    logDiagnostic(`renderer ${sourceId}:${String(line)} ${message}`);
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    logDiagnostic(`load failed ${String(errorCode)} ${errorDescription} ${validatedUrl}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    logDiagnostic(`renderer process gone: ${details.reason}`);
  });
  const rendererPath = join(import.meta.dirname, "..", "dist-renderer", "index.html");
  logDiagnostic(`loading renderer ${rendererPath}`);
  void window
    .loadFile(rendererPath)
    .catch((error: unknown) => {
      logDiagnostic(`load exception: ${error instanceof Error ? error.message : String(error)}`);
    });
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  checkUpdatesOnOpen();
}

app.whenReady().then(async () => {
  if(process.platform === "win32") app.setAppUserModelId("com.copilotbridge.desktop");
  if (!hasSingleInstanceLock) return;
  Menu.setApplicationMenu(null);
  nativeTheme.on("updated", updateTitleBarOverlay);
  let settings = await settingsStore.read();
  let legacyRestoreFailed=false;
  try{
    settings=await migrateCloudMode(settings,{
      isBridgeActive:async()=> (await profileStore.getStatus()).activeProfile==="bridge",
      restoreOriginal:()=>profileStore.activate("original"),
      writeSettings:next=>settingsStore.write(next),
    });
  }catch(error){legacyRestoreFailed=true;logDiagnostic(`Legacy connection restore failed: ${error instanceof Error?error.message:String(error)}`);}
  currentSettings = settings;
  await prepareBridgeEnvironment().catch(error=>logDiagnostic(`Local gateway initialization failed: ${error instanceof Error?error.name:'UnknownError'}`));
  applyTheme(settings.theme);
  if (!isIsolatedTestInstance) {
    app.setLoginItemSettings({
      openAtLogin: settings.autoLaunch,
      args: ["--autostart"],
    });
  }
  ipcMain.handle("profile:status", () => profileStore.getStatus());
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle('invite:message', async () => {
  const [summary,configuration]=await Promise.all([cloudClient.getReferralSummary(),cloudClient.getClientConfig().catch(()=>null)]);
  return inviteMessage(cloudBaseUrl,summary.code,configuration?.inviteCampaign);
});
ipcMain.handle('update:status', () => updater.status);
  ipcMain.handle('update:check', () => checkForUpdates(true));
  ipcMain.handle('update:install', () => installUpdate());
  ipcMain.handle("app:startup-warning",()=>startupWarning);
  ipcMain.handle("profile:activate", async (_event, target: ProfileId) => {
    if (target === 'bridge') {
      await requireInstalledChatGpt();
      requireCloudMode(await settingsStore.read());
      await prepareBridgeEnvironment();
    }
    const status = await profileStore.activate(target);
    broadcast("profile:status", status);
    return status;
  });
  ipcMain.handle("profile:acknowledge-restart", () => profileStore.acknowledgeRestart());
  ipcMain.handle("profile:prepare-bridge", prepareBridgeEnvironment);
  ipcMain.handle("system:restart", () => {
    throw new Error("自动重启已暂时禁用。请先解决 Windows 蓝屏问题，再手动重启以应用环境切换。");
  });
  ipcMain.handle("bridge:status", () => bridgeManager.getStatus());
  ipcMain.handle("chatgpt:status", () => chatGptManager.refreshStatus());
  ipcMain.handle("chatgpt:install", async () => {
    if ((await chatGptManager.refreshStatus(sendChatGptStatus)).state === "INSTALLED") return;
    chatGptManager.install(sendChatGptStatus, () => shell.openExternal(ChatGptManager.storeUri()), () => shell.openExternal(ChatGptManager.downloadPageUri()));
  });
  ipcMain.handle("chatgpt:download", async () => {
    await chatGptManager.installOffline(join(app.getPath("userData"), "official-client"), sendChatGptStatus);
  });
  ipcMain.handle("chatgpt:install-cancel", async () => {
    const cancelled = chatGptManager.cancelInstall();
    const detected = await chatGptManager.refreshStatus();
    if (detected.state === "INSTALLED") { sendChatGptStatus(detected); return; }
    sendChatGptStatus(cancelled
      ? { state: "NOT_INSTALLED", message: "已取消安装包下载。商店安装不受影响，完成后会自动检测。" }
      : { state: "INSTALLING", step: "INSTALLING", message: "Windows 正在完成安装，请稍候；关闭此窗口不会中止系统安装。" });
  });
  const prepareOfficialConnection=() => prepareOfficialClientConnection({
    getProfile:()=>profileStore.getStatus(),
    startBridge:async()=>{
      await prepareBridgeEnvironment();
      const settings=await settingsStore.read();requireCloudMode(settings);
      const status=await bridgeManager.start(settings);
      broadcast("bridge:status",status);refreshTray();return status;
    },
  });
  ipcMain.handle("chatgpt:launch", async () => {await prepareOfficialConnection();await chatGptManager.launch();});
  ipcMain.handle("chatgpt:restart", async () => {
    const status = await restartOfficialClientForProfile({prepare:prepareOfficialConnection,restart:()=>chatGptManager.restart(),acknowledge:()=>profileStore.acknowledgeRestart()});
    broadcast("profile:status", status);
    return status;
  });
  ipcMain.handle("diagnostics:get", async () => ({
    appVersion: app.getVersion(),
    bridge: bridgeManager.getStatus(),
    chatGpt: await chatGptManager.detect(),
    profile: await profileStore.getStatus(),
    settings: await settingsStore.read(),
  }));
  ipcMain.handle("bridge:start", async () => {
    await startBridge();
    return bridgeManager.getStatus();
  });
  ipcMain.handle("bridge:restart", async () => {
    const settings=await settingsStore.read();requireCloudMode(settings);
    const status = await bridgeManager.restart(settings);
    broadcast("bridge:status", status);
    return status;
  });
  ipcMain.handle("bridge:models", () => bridgeManager.models());
  ipcMain.handle(
    "service:switch",
    (_event, target: AppSettings["backendMode"]) => switchAiService(target),
  );
  ipcMain.handle("cloud:status", () => cloudFoundation.getStatus());
  ipcMain.handle("cloud:login", async (
    _event,
    credentials: { email: string; password: string; replaceDeviceId?: string },
  ) => {
    const status = await cloudFoundation.login(credentials);
    broadcast("cloud:status", status);
    if(status.loginDeviceLimit)return status;
    const settings = await settingsStore.read();
    if (settings.backendMode === "REMOTE") {
      requireCloudMode(settings);
      const bridge = await bridgeManager.restart(settings);
      broadcast("bridge:status", bridge);
      refreshTray();
    }
    return status;
  });
  ipcMain.handle("cloud:logout", async () => {
    const status = await cloudFoundation.logout();
    broadcast("cloud:status", status);
    return status;
  });
  ipcMain.handle("cloud:refresh", async () => {
    await refreshCloudStatus();
    return cloudFoundation.getStatus();
  });
  ipcMain.handle("cloud:manage-account", async () => {
    const configuration = await cloudConfiguration.get();
    if (!configuration.accountManagementUrl) {
      throw new Error("当前环境未配置账号管理页面。");
    }
    await shell.openExternal(configuration.accountManagementUrl);
  });
  ipcMain.handle("cloud:open-registration", async () => {
    const url = cloudRegistrationUrl(await cloudConfiguration.get());
    if (!url) throw new Error("当前环境未配置可信的网站注册地址。");
    await shell.openExternal(url);
  });
  ipcMain.handle("cloud:manage-subscription", async () => {
    const configuration = await cloudConfiguration.get();
    if (!configuration.subscriptionManagementUrl) {
      throw new Error("当前环境未配置订阅管理页面。");
    }
    await shell.openExternal(configuration.subscriptionManagementUrl);
  });
  ipcMain.handle("cloud:open-release", async () => {
    await checkForUpdates(true);
  });
  ipcMain.handle("cloud:device-revoke", async (_event, id: string) => {
    const status = await cloudFoundation.revokeDevice(id);
    broadcast("cloud:status", status);
    return status;
  });
  ipcMain.handle("cloud:device-rename", async (
    _event,
    request: { id: string; deviceName: string },
  ) => {
    const status = await cloudFoundation.renameDevice(
      request.id,
      request.deviceName,
    );
    broadcast("cloud:status", status);
    return status;
  });
  ipcMain.handle("cloud:referral-apply", async (_event, code: string) => {
    const status = await cloudFoundation.applyReferral(code);
    broadcast("cloud:status", status);
    return status;
  });
  ipcMain.handle("cloud:usage-settlement", (_event, responseId: string) =>
    cloudFoundation.getUsageSettlement(responseId));
  const unsupportedProvider = () => { throw new Error("Bridge 仅支持 Cloud，不再提供独立 API 连接选择。"); };
  ipcMain.handle("cloud:provider-connect", unsupportedProvider);
  ipcMain.handle("cloud:provider-activate", unsupportedProvider);
  ipcMain.handle("cloud:provider-disconnect", async (_event, id: string) => {
    const status = await cloudFoundation.deleteProviderConnection(id);
    const current = await settingsStore.read();
    if (current.providerConnectionId === id) {
      const next = { ...current, providerConnectionId: null };
      await settingsStore.write(next);
      currentSettings = next;
      const bridge = await bridgeManager.restart(next);
      broadcast("bridge:status", bridge);
    }
    broadcast("cloud:status", status);
    return status;
  });
  ipcMain.handle("settings:get", () => settingsStore.read());
  ipcMain.handle("settings:update", async (_event, next: AppSettings) => {
    requireCloudMode(next);
    const previous = await settingsStore.read();
    if (previous.backendMode !== next.backendMode) {
      throw new Error("请通过“切换 AI 服务”更改当前服务。");
    }
    await settingsStore.write(next);
    currentSettings = next;
    applyTheme(next.theme);
    if (!isIsolatedTestInstance) {
      app.setLoginItemSettings({
        openAtLogin: next.autoLaunch,
        args: ["--autostart"],
      });
    }
    const requiresBridgeRestart =
      previous.backendModel !== next.backendModel
      || previous.reasoningEffort !== next.reasoningEffort
      || previous.reasoningMode !== next.reasoningMode
      || previous.backendMode !== next.backendMode;
    const status = next.backendMode === "REMOTE"
      ? requiresBridgeRestart ? await remoteBridge.restart() : remoteBridge.getStatus()
      : requiresBridgeRestart ? await bridgeManager.restart(next) : bridgeManager.getStatus();
    broadcast("bridge:status", status);
    return next;
  });
  ipcMain.handle("oauth:start", () => { throw new Error("不再支持 GitHub Copilot 登录；开启开关可使用 Cloud。"); });
  ipcMain.handle("oauth:cancel", () => {});
  ipcMain.handle("oauth:open-verification", () => { throw new Error("不再提供 GitHub Copilot 登录入口。"); });


  const policyTimer = setInterval(() => {void cloudFoundation.syncPolicy().then(async status=>{if(status){broadcast("cloud:status",status);if(['SIGNED_OUT','DEVICE_REVOKED','ACCOUNT_LOCKED'].includes(status.authState)){if(bridgeManager.getStatus().state==='ready'){broadcast('bridge:status',await bridgeManager.stop());broadcast('bridge:models',[]);refreshTray();}}else await recoverCloudBridge();}}).catch(()=>undefined);},5000);
  let modelSyncInFlight=false;
  const modelTimer=setInterval(()=>{
    if(modelSyncInFlight||bridgeManager.getStatus().state!=="ready")return;
    modelSyncInFlight=true;
    void bridgeManager.models().then(models=>{if(bridgeManager.getStatus().state==="ready")broadcast("bridge:models",models);}).catch(error=>{
      const code=error&&typeof error==="object"&&"code" in error?String(error.code):"";
      if(["MODEL_NOT_ALLOWED","SUBSCRIPTION_REQUIRED","SUBSCRIPTION_EXPIRED","ACCOUNT_DISABLED","DEVICE_REVOKED"].includes(code))broadcast("bridge:models",[]);
    }).finally(()=>{modelSyncInFlight=false;});
  },5000);
  modelTimer.unref();
  app.once("before-quit",()=>clearInterval(modelTimer));
  policyTimer.unref();
  app.once("before-quit",()=>clearInterval(policyTimer));
  ensureTray();
  failureFeedback.start();
  app.once("before-quit",event=>{
    event.preventDefault();
    // Only await bounded local file work, never a pending network upload.
    void failureFeedback.close().finally(()=>app.quit());
  });
  if (process.argv.includes('--autostart')) checkUpdatesOnOpen();
  if (!process.argv.includes("--autostart")) {
    createWindow();
  }
  void profileStore.getStatus().then(async (status) => {
    const updated = !legacyRestoreFailed ? await profileStore.activate(status.activeProfile) : status;
    broadcast("profile:status", updated);
  }).catch(error => logDiagnostic(`Bridge profile refresh failed: ${error instanceof Error ? error.message : String(error)}`));
  if (settings.autoBridgeStart&&!legacyRestoreFailed) {
    void startBridge().catch(error=>logDiagnostic(`Bridge startup failed: ${error instanceof Error?error.name:"UnknownError"}`));
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  focusMainWindow();
});

app.on("before-quit", () => {
  logDiagnostic("Bridge before-quit");
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (!isQuitting && tray && currentSettings?.minimizeToTray !== false) {
    logDiagnostic("Bridge has no windows; keeping tray and gateway running");
    return;
  }
  if (process.platform !== "darwin") app.quit();
});

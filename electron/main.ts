import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { BridgeManager } from "./bridge-manager.js";
import { ProfileStore, defaultProfileStatePath, type ProfileId } from "./profile-store.js";
import { SettingsStore, type AppSettings } from "./settings-store.js";
import { WindowsUserEnvironment } from "./windows-user-environment.js";
import {
  CopilotAuthController,
  resolvePackagedRuntime,
  type AuthStatus,
} from "./copilot-auth.js";

const bridgeHome = join(process.env.USERPROFILE ?? "", ".copilot-bridge", "profiles", "bridge", "codex-home");
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
const profileStore = new ProfileStore(
  bridgeHome,
  defaultProfileStatePath(app.getPath("userData")),
  new WindowsUserEnvironment(),
);
function nodePathForCurrentBuild(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "node-runtime", "node.exe")
    : join(app.getAppPath(), "resources", "node-runtime", "node.exe");
}
const settingsStore = new SettingsStore(join(app.getPath("userData"), "settings.json"));
const bridgeManager = new BridgeManager(
  app.getPath("userData"),
  proxyEntrypoint,
  nodePathForCurrentBuild(),
  runtimePathForCurrentBuild(),
  bridgeHome,
);
let authController: CopilotAuthController | null = null;

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

function sendAuthStatus(status: AuthStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("oauth:status", status);
  }
}

async function prepareBridgeEnvironment(): Promise<void> {
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
  const existingApiKey = await new WindowsUserEnvironment().read("COPILOT_BRIDGE_API_KEY");
  if (!existingApiKey) {
    await new WindowsUserEnvironment().write("COPILOT_BRIDGE_API_KEY", randomUUID().replaceAll("-", ""));
  }
}

async function startBridge(): Promise<void> {
  const settings = await settingsStore.read();
  const status = await bridgeManager.start(settings);
  broadcast("bridge:status", status);
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 860,
    height: 660,
    minWidth: 820,
    minHeight: 620,
    center: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#F5F5F7",
      symbolColor: "#1D1D1F",
      height: 48,
    },
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ipcMain.handle("profile:status", () => profileStore.getStatus());
  ipcMain.handle("profile:activate", (_event, target: ProfileId) => profileStore.activate(target));
  ipcMain.handle("profile:acknowledge-restart", () => profileStore.acknowledgeRestart());
  ipcMain.handle("profile:prepare-bridge", prepareBridgeEnvironment);
  ipcMain.handle("system:restart", async () => {
    const { spawn } = await import("node:child_process");
    spawn("shutdown.exe", ["/r", "/t", "0"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  });
  ipcMain.handle("bridge:status", () => bridgeManager.getStatus());
  ipcMain.handle("bridge:start", async () => {
    await startBridge();
    return bridgeManager.getStatus();
  });
  ipcMain.handle("bridge:restart", async () => {
    const status = await bridgeManager.restart(await settingsStore.read());
    broadcast("bridge:status", status);
    return status;
  });
  ipcMain.handle("bridge:models", () => bridgeManager.models());
  ipcMain.handle("settings:get", () => settingsStore.read());
  ipcMain.handle("settings:update", async (_event, next: AppSettings) => {
    await settingsStore.write(next);
    const status = await bridgeManager.restart(next);
    broadcast("bridge:status", status);
    return next;
  });
  ipcMain.handle("oauth:start", () => {
    const runtimePath = resolvePackagedRuntime(
      process.resourcesPath,
      process.env.COPILOT_BRIDGE_RUNTIME_PATH ?? runtimePathForCurrentBuild(),
    );
    authController = new CopilotAuthController(
      runtimePath,
      (status) => {
        sendAuthStatus(status);
        if (status.state === "completed") {
          void startBridge();
        }
      },
      (verificationUrl) => shell.openExternal(verificationUrl),
    );
    authController.start();
  });
  ipcMain.handle("oauth:cancel", () => {
    authController?.cancel();
  });

  createWindow();
  void profileStore
    .completeIfEnvironmentApplied(process.env.CODEX_HOME)
    .then((status) => broadcast("profile:status", status));
  void startBridge();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

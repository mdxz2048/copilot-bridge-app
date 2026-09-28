import type { ProfileId, ProfileStatus } from "./profile-store.js";
import type { AuthStatus } from "./copilot-auth.js";
import type { BridgeModel, BridgeStatus } from "./bridge-manager.js";
import type { AppSettings } from "./settings-store.js";
import type { ChatGptStatus } from "./chatgpt-manager.js";
import type { CloudServiceStatus } from "./cloud/cloud-foundation.js";
import type {
  RegisterRequestV2,
  UsageSettlementV2,
  User,
} from "./cloud/contract.js";

interface Diagnostics {
  appVersion: string;
  bridge: BridgeStatus;
  chatGpt: ChatGptStatus;
  profile: ProfileStatus;
  settings: AppSettings;
}

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

contextBridge.exposeInMainWorld("copilotBridge", {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  getProfileStatus: (): Promise<ProfileStatus> => ipcRenderer.invoke("profile:status"),
  activateProfile: (target: ProfileId): Promise<ProfileStatus> =>
    ipcRenderer.invoke("profile:activate", target),
  acknowledgeRestart: (): Promise<ProfileStatus> =>
    ipcRenderer.invoke("profile:acknowledge-restart"),
  prepareBridgeEnvironment: (): Promise<void> => ipcRenderer.invoke("profile:prepare-bridge"),
  restartSystem: (): Promise<void> => ipcRenderer.invoke("system:restart"),
  startCopilotLogin: (): Promise<void> => ipcRenderer.invoke("oauth:start"),
  cancelCopilotLogin: (): Promise<void> => ipcRenderer.invoke("oauth:cancel"),
  openCopilotVerification: (url: string): Promise<void> =>
    ipcRenderer.invoke("oauth:open-verification", url),
  onCopilotLoginStatus: (handler: (status: AuthStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AuthStatus) => handler(status);
    ipcRenderer.on("oauth:status", listener);
    return () => ipcRenderer.removeListener("oauth:status", listener);
  },
  getBridgeStatus: (): Promise<BridgeStatus> => ipcRenderer.invoke("bridge:status"),
  startBridge: (): Promise<BridgeStatus> => ipcRenderer.invoke("bridge:start"),
  restartBridge: (): Promise<BridgeStatus> => ipcRenderer.invoke("bridge:restart"),
  getModels: (): Promise<BridgeModel[]> => ipcRenderer.invoke("bridge:models"),
  switchAiService: (
    target: AppSettings["backendMode"],
  ): Promise<{
    settings: AppSettings;
    bridge: BridgeStatus;
    models: BridgeModel[];
  }> => ipcRenderer.invoke("service:switch", target),
  getCloudStatus: (): Promise<CloudServiceStatus> =>
    ipcRenderer.invoke("cloud:status"),
  registerCloud: (request: RegisterRequestV2): Promise<User> =>
    ipcRenderer.invoke("cloud:register", request),
  loginCloud: (
    credentials: { email: string; password: string },
  ): Promise<CloudServiceStatus> =>
    ipcRenderer.invoke("cloud:login", credentials),
  logoutCloud: (): Promise<CloudServiceStatus> =>
    ipcRenderer.invoke("cloud:logout"),
  refreshCloud: (): Promise<CloudServiceStatus> =>
    ipcRenderer.invoke("cloud:refresh"),
  manageCloudAccount: (): Promise<void> =>
    ipcRenderer.invoke("cloud:manage-account"),
  manageCloudSubscription: (): Promise<void> =>
    ipcRenderer.invoke("cloud:manage-subscription"),
  openCloudRelease: (): Promise<void> =>
    ipcRenderer.invoke("cloud:open-release"),
  revokeCloudDevice: (id: string): Promise<CloudServiceStatus> =>
    ipcRenderer.invoke("cloud:device-revoke", id),
  renameCloudDevice: (
    request: { id: string; deviceName: string },
  ): Promise<CloudServiceStatus> =>
    ipcRenderer.invoke("cloud:device-rename", request),
  applyReferral: (code: string): Promise<CloudServiceStatus> =>
    ipcRenderer.invoke("cloud:referral-apply", code),
  getCloudUsageSettlement: (
    responseId: string,
  ): Promise<UsageSettlementV2> =>
    ipcRenderer.invoke("cloud:usage-settlement", responseId),
  connectCloudProvider: (
    request: { providerId: string; label: string; apiKey: string },
  ) => ipcRenderer.invoke("cloud:provider-connect", request),
  disconnectCloudProvider: (id: string): Promise<CloudServiceStatus> =>
    ipcRenderer.invoke("cloud:provider-disconnect", id),
  activateCloudProvider: (id: string) =>
    ipcRenderer.invoke("cloud:provider-activate", id),
  onCloudStatus: (
    handler: (status: CloudServiceStatus) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: CloudServiceStatus,
    ) => handler(status);
    ipcRenderer.on("cloud:status", listener);
    return () => ipcRenderer.removeListener("cloud:status", listener);
  },
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:update", settings),
  onBridgeStatus: (handler: (status: BridgeStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: BridgeStatus) => handler(status);
    ipcRenderer.on("bridge:status", listener);
    return () => ipcRenderer.removeListener("bridge:status", listener);
  },
  onProfileStatus: (handler: (status: ProfileStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ProfileStatus) => handler(status);
    ipcRenderer.on("profile:status", listener);
    return () => ipcRenderer.removeListener("profile:status", listener);
  },
  getChatGptStatus: (): Promise<ChatGptStatus> => ipcRenderer.invoke("chatgpt:status"),
  installChatGpt: (): Promise<void> => ipcRenderer.invoke("chatgpt:install"),
  cancelChatGptInstall: (): Promise<void> => ipcRenderer.invoke("chatgpt:install-cancel"),
  launchChatGpt: (): Promise<void> => ipcRenderer.invoke("chatgpt:launch"),
  getDiagnostics: (): Promise<Diagnostics> => ipcRenderer.invoke("diagnostics:get"),
  onChatGptStatus: (handler: (status: ChatGptStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ChatGptStatus) => handler(status);
    ipcRenderer.on("chatgpt:status", listener);
    return () => ipcRenderer.removeListener("chatgpt:status", listener);
  },
});
